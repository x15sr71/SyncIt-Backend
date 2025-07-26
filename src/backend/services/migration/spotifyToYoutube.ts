import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../auth/youtube/youtubeTokensUtil";
import { searchTracksOnYoutubeService } from "../../services/search/searchYoutube/searchYoutube";
import { callOpenAIModel } from "../../openAI/getBestMatch";
import { getSpotifyPlaylistContent } from "../../services/getPlaylistContent/getSpotifyPlaylistContent";
import { addToYoutubePlaylist } from "../../services/addTo/addToYoutube";
import prisma from "../../../db";

const MAX_LLM_CHUNK_CHARS = 10000;

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
      block += `  - ${r.resultNumber}. Channel: ${r.channelTitle}, Published: ${r.publishedDate}\n`;
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

export async function migrateSpotifyPlaylistToYoutube(
  userId: string,
  youtubePlaylistId: string,
  spotifyPlaylistId: string
) {
  // Defensive parameter check
  if (!userId || !spotifyPlaylistId || !youtubePlaylistId) {
    throw {
      success: false,
      error: "MISSING_PARAMETERS",
      message: "Missing required parameters",
      statusCode: 400,
    };
  }

  // 1. Fetch Spotify tracks
  let spotifyData;
  try {
    spotifyData = await getSpotifyPlaylistContent(userId, spotifyPlaylistId);
  } catch (fetchError: any) {
    throw {
      success: false,
      error: "SPOTIFY_PLAYLIST_FETCH_FAILED",
      message: fetchError?.message || "Failed to fetch Spotify playlist data",
      statusCode: 502,
    };
  }
  console.log("$$$$$$$$$$$$$$$$$$$$");
  console.log(spotifyData);
  console.log("$$$$$$$$$$$$$$$$$$$$");

  if (spotifyData.length === 0) {
    throw {
      success: false,
      error: "EMPTY_SPOTIFY_PLAYLIST",
      message: "Spotify playlist is empty",
      statusCode: 400,
    };
  }

  // 2. Prepare inputs and search YouTube
  const ytInputs = spotifyData.map((t) => ({
    trackName: t.name,
    artists: t.artists.join(", "),
    albumName: t.album,
  }));

  let rawYtResults;
  try {
    rawYtResults = await searchTracksOnYoutubeService(userId, ytInputs);
  } catch (ytError: any) {
    throw {
      success: false,
      error: "YOUTUBE_SEARCH_FAILED",
      message: ytError?.message || "Failed to search tracks on YouTube",
      statusCode: 502,
    };
  }

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

    let content: string;
    try {
      const result = await callOpenAIModel([
        {
          role: "user",
          content: `
For each track in the following list, select the best matching YouTube search result from the options provided.

Return a valid JSON object with the format:
{
  "1": 2,
  "2": 1,
  "3": "error",
  ...
}

Instructions:
- Keys must be **all** track numbers listed in the input (no skipping, no extra entries).
- Values must be either:
  - A number (1-based result index of the best YouTube match for that track), OR
  - The string "error" if no result is appropriate.
- Do **not** guess. Use only the provided data.
- Ensure all track numbers match the actual "Track Number" field exactly (e.g., "1", "2", ..., etc).
- Do not include any additional keys or explanation — return **only** the JSON object.

Now, here is the list:
${chunk}
`,
        },
      ]);
      content = result.content;
    } catch (llmError: any) {
      throw {
        success: false,
        error: "LLM_MODEL_ERROR",
        message: llmError?.message || "Failed to get response from LLM",
        statusCode: 502,
      };
    }

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
      throw {
        success: false,
        error: "LLM_PARSE_ERROR",
        message: "Failed to parse LLM response",
        statusCode: 502,
      };
    }
    for (const [numStr, pick] of Object.entries(parsed)) {
      const num = Number(numStr);
      if (typeof pick === "number") {
        bestMatches[num] = pick;
      } else {
        const trackData = searchResults[num - 1];
        const title = trackData?.title || "Unknown Title";
        failedDetails.push(`Track ${numStr}: ${title}`);
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
  try {
    await prisma.spotifyData.updateMany({
      where: { userId },
      data: { retryToFindTracks: JSON.stringify(failedDetails) },
    });
  } catch (prismaError: any) {
    throw {
      success: false,
      error: "DB_UPDATE_FAILED",
      message: prismaError?.message || "Failed to update DB with failed tracks",
      statusCode: 500,
    };
  }

  // ensure YouTube token is fresh
  try {
    await get_YoutubeAccessToken(userId);
  } catch {
    try {
      await refreshYoutubeAccessToken(userId);
    } catch (tokenError: any) {
      throw {
        success: false,
        error: "YOUTUBE_TOKEN_REFRESH_FAILED",
        message: tokenError?.message || "Failed to refresh YouTube access token",
        statusCode: 401,
      };
    }
  }

  try {
    await addToYoutubePlaylist(userId, videoIdsToAdd, youtubePlaylistId);
  } catch (addError: any) {
    throw {
      success: false,
      error: "ADD_TO_YOUTUBE_PLAYLIST_FAILED",
      message: addError?.message || "Failed to add tracks to YouTube playlist",
      statusCode: 502,
    };
  }

  return {
    success: true,
    addedCount: videoIdsToAdd.length,
    failedCount: failedDetails.length,
    videoIds: videoIdsToAdd,
    failedDetails,
  };
}
