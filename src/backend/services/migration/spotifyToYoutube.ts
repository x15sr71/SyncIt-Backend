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
  spotifyPlaylistId: string,
  youtubePlaylistId: string,
  playlistName?: string
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

  console.log(`[Service] Starting migration: Spotify playlist ${spotifyPlaylistId} -> YouTube playlist ${youtubePlaylistId}`);

  // 1. Fetch Spotify tracks
  let spotifyData;
  try {
    spotifyData = await getSpotifyPlaylistContent(userId, spotifyPlaylistId);
    console.log(`[Service] Fetched ${spotifyData.length} tracks from Spotify playlist`);
  } catch (fetchError: any) {
    console.error("[Service] Failed to fetch Spotify playlist:", fetchError);
    throw {
      success: false,
      error: "SPOTIFY_PLAYLIST_FETCH_FAILED",
      message: fetchError?.message || "Failed to fetch Spotify playlist data",
      statusCode: 502,
    };
  }

  if (spotifyData.length === 0) {
    throw {
      success: false,
      error: "EMPTY_SPOTIFY_PLAYLIST",
      message: "Spotify playlist is empty",
      statusCode: 400,
    };
  }

  // 🆕 Deduplicate Spotify tracks by ID before processing
  const uniqueSpotifyTracks = spotifyData.filter((track, index, self) => 
    index === self.findIndex(t => t.id === track.id)
  );

  console.log(`[Service] Original tracks: ${spotifyData.length}, Unique tracks: ${uniqueSpotifyTracks.length}`);

  // 🆕 Extract Spotify track IDs from deduplicated tracks
  let spotifyTrackIds = uniqueSpotifyTracks.map((track) => track.id);
  console.log("Spotify Track IDs:", spotifyTrackIds);

  // 🆕 Check for existing tracks in playlistMigration
  const existingMigration = await prisma.playlistMigration.findFirst({
    where: {
      userId: userId,
      sourcePlaylistId: spotifyPlaylistId,
      sourcePlatform: "SPOTIFY",
      destinationPlatform: "YOUTUBE"
    },
    select: {
      sourceTrackIds: true
    }
  });

  const existingTrackIds = existingMigration?.sourceTrackIds || [];
  console.log("Existing track IDs in migration:", existingTrackIds);

  // 🆕 Filter out tracks that already exist in the migration
  const newTracksOnly = uniqueSpotifyTracks.filter(track => 
    !existingTrackIds.includes(track.id)
  );
  
  console.log(`Total Spotify tracks: ${uniqueSpotifyTracks.length}`);
  console.log(`Already migrated tracks: ${existingTrackIds.length}`);
  console.log(`New tracks to process: ${newTracksOnly.length}`);

  // If no new tracks to process, skip the processing
  if (!newTracksOnly.length) {
    console.log("No new tracks to migrate. All tracks already exist in migration.");
    return {
      success: true,
      addedCount: 0,
      failedCount: 0,
      videoIds: [],
      failedDetails: [],
      message: "No new tracks to migrate"
    };
  }

  // 2. Prepare inputs and search YouTube (only for new tracks)
  const ytInputs = newTracksOnly.map((t) => ({
    trackName: t.name,
    artists: t.artists.join(", "),
    albumName: t.album,
  }));

  console.log(`[Service] Searching YouTube for ${ytInputs.length} tracks`);
  let rawYtResults;
  try {
    rawYtResults = await searchTracksOnYoutubeService(userId, ytInputs);
    console.log(`[Service] YouTube search completed, processing results`);
  } catch (ytError: any) {
    console.error("[Service] YouTube search failed:", ytError);
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

  // 🆕 Initialize newSpotifyTrackIds with only new track IDs
  let newSpotifyTrackIds = newTracksOnly.map((track) => track.id);

  console.log(`[Service] Processing ${llmChunks.length} LLM chunks for track matching`);
  for (const chunk of llmChunks) {
    console.log("[Service] Sending chunk to LLM for best match selection");

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
      console.error("[Service] LLM processing failed:", llmError);
      throw {
        success: false,
        error: "LLM_MODEL_ERROR",
        message: llmError?.message || "Failed to get response from LLM",
        statusCode: 502,
      };
    }

    console.log("[Service] Processing LLM response for track matching");
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[Service] Failed to parse LLM response");
      throw {
        success: false,
        error: "LLM_PARSE_ERROR",
        message: "Failed to parse LLM response",
        statusCode: 502,
      };
    }
    
    // 🆕 Filter newSpotifyTrackIds to keep only those with number values in parsed results
    newSpotifyTrackIds = newSpotifyTrackIds.filter((trackId, index) => {
      const resultKey = (index + 1).toString();
      const resultValue = parsed[resultKey];
      return typeof resultValue === "number";
    });

    console.log("Filtered New Spotify Track IDs:", newSpotifyTrackIds);
    
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

  console.log(`[Service] Selected ${videoIdsToAdd.length} videos to add, ${failedDetails.length} failed matches`);

  // 🆕 Combine existing track IDs with new successful ones
  const allSuccessfulTrackIds = [...existingTrackIds, ...newSpotifyTrackIds];

  // 🆕 Save migration state to database
  const saveMigrationData = await prisma.playlistMigration.upsert({
    where: {
      userId_sourcePlaylistId_sourcePlatform_destinationPlatform: {
        userId: userId,
        sourcePlaylistId: spotifyPlaylistId,
        sourcePlatform: "SPOTIFY",
        destinationPlatform: "YOUTUBE",
      },
    },
    update: {
      sourceTrackIds: allSuccessfulTrackIds,
      migrationCounter: {
        increment: 1,
      },
      updatedAt: new Date(),
    },
    create: {
      userId: userId,
      sourcePlaylistId: spotifyPlaylistId,
      sourcePlatform: "SPOTIFY",
      destinationPlatform: "YOUTUBE",
      sourceTrackIds: allSuccessfulTrackIds,
      migrationCounter: 1,
    },
  });

  console.log("Migration data saved:", saveMigrationData);

  // 6. Store failed tracks in database
  try {
    const youtubeUserId = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (youtubeUserId) {
      await prisma.youTubeData.update({
        where: { id: youtubeUserId.id },
        data: { retryToFindTracks: JSON.stringify(failedDetails) },
      });
      console.log("[Service] Stored failed tracks in database");
    }
  } catch (prismaError: any) {
    console.warn("[Service] Failed to update database with failed tracks:", prismaError);
    // Don't throw here, continue with migration
  }

  // 7. Ensure YouTube token is fresh
  try {
    await get_YoutubeAccessToken(userId);
  } catch {
    try {
      console.log("[Service] Refreshing YouTube access token");
      await refreshYoutubeAccessToken(userId);
    } catch (tokenError: any) {
      console.error("[Service] YouTube token refresh failed:", tokenError);
      throw {
        success: false,
        error: "YOUTUBE_TOKEN_REFRESH_FAILED",
        message: tokenError?.message || "Failed to refresh YouTube access token",
        statusCode: 401,
      };
    }
  }

  // 8. Add videos to YouTube playlist
  let actuallyAddedVideoIds: string[] = [];
  try {
    console.log(`[Service] Adding ${videoIdsToAdd.length} videos to YouTube playlist ${youtubePlaylistId}`);
    actuallyAddedVideoIds = await addToYoutubePlaylist(userId, videoIdsToAdd, youtubePlaylistId);
    console.log(`[Service] Successfully added ${actuallyAddedVideoIds.length} videos to YouTube playlist`);
  } catch (addError: any) {
    console.error("[Service] Failed to add videos to YouTube playlist:", addError);
    throw {
      success: false,
      error: "ADD_TO_YOUTUBE_PLAYLIST_FAILED",
      message: addError?.message || "Failed to add tracks to YouTube playlist",
      statusCode: 502,
    };
  }

  console.log(`[Service] Migration completed successfully: ${actuallyAddedVideoIds.length} tracks added, ${failedDetails.length} failed`);
  return {
    success: true,
    addedCount: actuallyAddedVideoIds.length,
    failedCount: failedDetails.length,
    videoIds: actuallyAddedVideoIds,
    failedDetails,
  };
}
