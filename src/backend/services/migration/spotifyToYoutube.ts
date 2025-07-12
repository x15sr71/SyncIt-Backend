// src/services/migrate/migrateSpotifyPlaylistToYoutube.ts

import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../OAuth/tokenManagement/youtubeTokensUtil";
import { searchTracksOnYoutubeService } from "../../services/search/searchYoutube/searchYoutube";
import { callOpenAIModel } from "../../openAI/getBestMatch";
import { getSpotifyPlaylistContent } from "../../services/getPlaylistContent/getSpotifyPlaylistContent";
import { addToYoutubePlaylist } from "../../services/addTo/addToYoutube";
import prisma from "../../../db";

const MAX_LLM_CHUNK_CHARS = 10000;

/** Build LLM‐friendly text chunks from search results + Spotify metadata */
function chunkTracksForLLM(
  searchResults: Array<{
    trackNumber: number;
    title: string;
    artists: string[];
    album: string;
    release_date?: string;
    results: Array<{
      videoId: string;
      channelTitle: string;
      publishedDate: string;
      resultNumber: number;
    }>;
  }>
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const item of searchResults) {
    let block =
      `Track Number: ${item.trackNumber}\n` +
      `Title: ${item.title}\n` +
      `Artists: ${item.artists.join(", ")}\n` +
      `Album: ${item.album}\n`;
    if (item.release_date) {
      block += `Release Date: ${item.release_date}\n`;
    }
    block += `YouTube Results:\n`;
    for (const r of item.results) {
      block += `  - ${r.resultNumber}. ID:${r.videoId}, Channel:${r.channelTitle}, Published:${r.publishedDate}\n`;
    }
    block += "\n";

    if (current.length + block.length > MAX_LLM_CHUNK_CHARS) {
      chunks.push(current);
      current = block;
    } else {
      current += block;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Migrate a Spotify playlist to YouTube:
 * 1. Fetch Spotify tracks
 * 2. Search YouTube for every track
 * 3. Chunk and call OpenAI to pick best match
 * 4. Persist failures & add to YouTube playlist
 */
export async function migrateSpotifyPlaylistToYoutube(
  userId: string,
  youtubePlaylistId: string,
  spotifyPlaylistId: string
) {
  if (!userId || !spotifyPlaylistId || !youtubePlaylistId) {
    throw new Error("Missing required parameters");
  }

  // 1. Fetch Spotify tracks
  const spotifyData = await getSpotifyPlaylistContent(
    userId,
    spotifyPlaylistId
  );
  console.log("$$$$$$$$$$$$$$$$$$$$");
  console.log(spotifyData);
  console.log("$$$$$$$$$$$$$$$$$$$$");
  if (spotifyData.length === 0) {
    return { success: false, message: "Spotify playlist is empty" };
  }

  // 2. Prepare inputs and search YouTube
  const ytInputs = spotifyData.map((t) => ({
    trackName: t.name,
    artists: t.artists.join(", "),
    albumName: t.album,
  }));
  const rawYtResults = await searchTracksOnYoutubeService(userId, ytInputs);

  // 3. Annotate with trackNumber + normalize shape
  const searchResults = rawYtResults.map((r, idx) => ({
    trackNumber: idx + 1,
    title: r.trackName,
    artists: ytInputs[idx].artists.split(", "),
    album: ytInputs[idx].albumName,
    results: r.results.map((item: any, i: number) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedDate: item.snippet.publishedAt,
      resultNumber: i + 1,
    })),
  }));

  // 4. Chunk for LLM and pick best matches
  const llmChunks = chunkTracksForLLM(searchResults);
  const bestMatches: Record<number, number> = {};
  const failedDetails: string[] = [];

  for (const chunk of llmChunks) {
    console.log("==== Sending to LLM ====");
    console.log(chunk);
    console.log("========================");

    const { content } = await callOpenAIModel([
      {
        role: "user",
        content: `
For each track in the following list (Track Number 1 to 11), pick the best matching YouTube search result from the options provided.

Return a valid JSON object like:
{
  "1": 2,
  "2": 1,
  "3": "error",
  ...
}

For each track:
- If a match is found, return the result number (1-based index).
- If no suitable match is found, return "error" as the value.
You MUST include all track numbers from 1 to 11 in the JSON response — no skipping.
Now, here is the list:
${chunk}
`,
      },
    ]);

    console.log("==== LLM Raw Response ====");
    console.log(content);
    console.log("==========================");

    let parsed: any;
    try {
      parsed = JSON.parse(content);
      console.log("==== Parsed LLM Selection ====");
      console.log(parsed);
      console.log("================================");
    } catch {
      console.log("Failed to parse LLM response");
      continue;
    }
    for (const [numStr, pick] of Object.entries(parsed)) {
      const num = Number(numStr);
      if (typeof pick === "number") {
        bestMatches[num] = pick;
      } else {
        failedDetails.push(`Track ${numStr}: ${searchResults[num - 1].title}`);
      }
    }
  }

  // 5. Collect video IDs to add
  const videoIdsToAdd = Object.entries(bestMatches)
    .map(([numStr, pick]) => {
      const num = Number(numStr);
      const entry = searchResults.find((e) => e.trackNumber === num);
      return entry?.results[pick - 1]?.videoId;
    })
    .filter((id): id is string => typeof id === "string");

  console.log("==== Final Selected Video IDs ====");
  console.log(videoIdsToAdd);
  console.log("==================================");

  // 6. Persist failures & add videos
  await prisma.spotifyData.updateMany({
    where: { userId },
    data: { retryToFindTracks: JSON.stringify(failedDetails) },
  });

  // ensure YouTube token is fresh
  try {
    await get_YoutubeAccessToken(userId);
  } catch {
    await refreshYoutubeAccessToken(userId);
  }

  await addToYoutubePlaylist(userId, videoIdsToAdd, youtubePlaylistId);

  return {
    success: true,
    addedCount: videoIdsToAdd.length,
    failedCount: failedDetails.length,
    videoIds: videoIdsToAdd,
    failedDetails,
  };
}
