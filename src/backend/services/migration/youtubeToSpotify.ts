// services/migration/youtubeToSpotify.ts

import { searchYoutubeTracks } from "../search/searchSpotify/searchYoutube";
import { trimTrackDescriptions } from "../../utility/trim";
import { searchTracksOnSpotify } from "../search/searchSpotify/searchSpotify";
import { callOpenAIModel } from "../../openAI/getBestMatch";
import { addToSptPlaylist } from "../addTo/addToSptPlaylist";
import prisma from "../../../db";

const MAX_LLM_CHUNK_CHARS = 10000;

// Main function for scheduled auto-sync (matching the interface expected by ScheduledSyncService)
export async function migrateYoutubePlaylistToSpotify(
  userId: string,
  spotifyPlaylistId: string,
  youtubePlaylistId: string
) {
  console.log(`[YouTube→Spotify] Starting migration: YouTube playlist ${youtubePlaylistId} → Spotify playlist ${spotifyPlaylistId}`);

  try {
    // Use the existing service but with the playlist ID parameter structure expected by scheduled sync
    const result = await migrateYoutubeToSpotifyService(
      userId,
      youtubePlaylistId,
      spotifyPlaylistId // Use as playlist name for now - you might want to fetch actual name
    );

    // Transform the response to match the expected format for scheduled sync
    return {
      success: true,
      addedCount: result.numberOfTracksAdded,
      failedCount: result.failedTrackDetails.length,
      trackUris: result.trackIdsToAdd, // Note: these are actually Spotify track IDs, not URIs
      failedDetails: result.failedTrackDetails,
      videoIds: result.trackIdsToAdd, // For compatibility with existing interface
    };
  } catch (error: any) {
    console.error(`[YouTube→Spotify] Migration failed:`, error);
    throw {
      success: false,
      error: "YOUTUBE_TO_SPOTIFY_MIGRATION_FAILED",
      message: error?.message || "Failed to migrate YouTube playlist to Spotify",
      statusCode: 502,
    };
  }
}

// Your existing service function (keeping it as-is for backward compatibility)
export const migrateYoutubeToSpotifyService = async (
  userId: string,
  playlistId: string,
  playlistName: string
) => {
  const youtubeUserId = await prisma.youTubeData.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!youtubeUserId) {
    throw new Error("YouTube user not found in database.");
  }

  // 👇 Use playlistId in searchYoutubeTracks
  const allYoutubeTracks = await searchYoutubeTracks(userId, playlistId);

  // 🆕 Deduplicate YouTube tracks by trackId before processing
  const uniqueYoutubeTracks = allYoutubeTracks.data.filter((track, index, self) => 
    index === self.findIndex(t => t.trackId === track.trackId)
  );

  console.log(`[Service] Original tracks: ${allYoutubeTracks.data.length}, Unique tracks: ${uniqueYoutubeTracks.length}`);

  const formattedYoutubeTracks = trimTrackDescriptions(
    uniqueYoutubeTracks, // 🆕 Use deduplicated tracks
    750
  );

  // 🆕 Extract YouTube track IDs from deduplicated tracks
  let youtubeTrackIds = uniqueYoutubeTracks.map((track) => track.trackId);
  console.log("Youtube Track IDs:", youtubeTrackIds);

  if (!formattedYoutubeTracks.length) {
    throw new Error("NO_YOUTUBE_TRACKS");
  }

  // 🆕 Check for existing tracks in playlistMigration
  const existingMigration = await prisma.playlistMigration.findFirst({
    where: {
      userId: userId,
      playlistId: playlistId,
      sourcePlatform: "YOUTUBE",
      destinationPlatform: "SPOTIFY"
    },
    select: {
      sourceTrackIds: true
    }
  });

  const existingTrackIds = existingMigration?.sourceTrackIds || [];
  console.log("Existing track IDs in migration:", existingTrackIds);

  // 🆕 Filter out tracks that already exist in the migration
  const newTracksOnly = uniqueYoutubeTracks.filter(track => 
    !existingTrackIds.includes(track.trackId)
  );
  
  const formattedNewTracksOnly = trimTrackDescriptions(newTracksOnly, 750);
  
  console.log(`Total YouTube tracks: ${uniqueYoutubeTracks.length}`);
  console.log(`Already migrated tracks: ${existingTrackIds.length}`);
  console.log(`New tracks to process: ${newTracksOnly.length}`);

  // If no new tracks to process, skip the LLM processing
  if (!newTracksOnly.length) {
    console.log("No new tracks to migrate. All tracks already exist in migration.");
    return {
      bestMatches: {},
      trackIdsToAdd: [],
      done: "done",
      numberOfTracksAdded: 0,
      failedTrackDetails: [],
      message: "No new tracks to migrate"
    };
  }

  const searchChunks = chunkArray(formattedNewTracksOnly, 20, 10);
  let spotifySearchResults = [];
  let globalTrackNumber = 1;
  let bestMatches = {};
  let failedTrackDetails = [];

  for (const chunk of searchChunks) {
    const chunkResults = await searchTracksOnSpotify(
      chunk,
      globalTrackNumber,
      userId
    );
    spotifySearchResults = spotifySearchResults.concat(chunkResults);
    globalTrackNumber += chunk.length;
  }

  const llmChunks = chunkTracksForLLM(
    spotifySearchResults,
    newTracksOnly // 🆕 Use filtered tracks instead of all tracks
  );

  // 🆕 Initialize youtubeTrackIds with only new track IDs
  let newYoutubeTrackIds = newTracksOnly.map((track) => track.trackId);

  for (const chunkText of llmChunks) {
    const messages = [
      {
        role: "user",
        content: `Please identify the best matching Spotify search result for each track in the following list based solely on the current input.
                    Do not consider any previous interactions or suggestions.
                    Use these criteria: title, YouTube channel name, YouTube video duration, artist relevance, and release date.
                    Return the results in this format: {
                        "1": <resultNumber>,
                        "2": <resultNumber>,
                        ...
                    }
                    If a track does not have a match, respond with { "error": "Unable to find best match for track <trackNumber>" }.
                    \n\n${chunkText}`,
      },
    ];

    const bestResultsForChunk = await callOpenAIModel(messages);
    console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
    console.log("LLM response for chunk:", bestResultsForChunk);
    console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@");

    let parsedBestResults: any;
    try {
      parsedBestResults = JSON.parse(bestResultsForChunk.content);
      console.log("$$$$$$$$$$$$$$$$$$$$$$");
      console.log(parsedBestResults);
      console.log("$$$$$$$$$$$$$$$$$$$$$$");
      // Filter newYoutubeTrackIds to keep only those with integer values in parsedBestResults
      newYoutubeTrackIds = newYoutubeTrackIds.filter((trackId, index) => {
        const resultKey = (index + 1).toString(); // Convert 0-based index to 1-based key
        const resultValue = parsedBestResults[resultKey];

        // Keep only if the value is a number (integer)
        return typeof resultValue === "number" && Number.isInteger(resultValue);
      });

      console.log("Filtered New YouTube Track IDs:", newYoutubeTrackIds);
    } catch {
      console.warn("Skipping chunk: could not parse LLM response");
      continue;
    }

    for (const trackNumber in parsedBestResults) {
      const result = parsedBestResults[trackNumber];
      const youtubeTrack = newTracksOnly[Number(trackNumber) - 1]; // 🆕 Use newTracksOnly

      if (!youtubeTrack) continue;

      if (result?.error) {
        bestMatches[trackNumber] = { error: result.error };
        const details =
          `Title: ${youtubeTrack.title}\n` +
          `Channel: ${youtubeTrack.channelName}\n` +
          `Duration: ${youtubeTrack.duration}\n` +
          `Published: ${youtubeTrack.publishedDate}\n`;
        failedTrackDetails.push(details);
      } else {
        bestMatches[trackNumber] = result;
      }
    }
  }

  const trackIdsToAdd: string[] = [];

  for (const trackNumber in bestMatches) {
    const match = bestMatches[trackNumber];
    if (!match?.error) {
      const resultIndex = match;
      const correspondingTrack = spotifySearchResults.find(
        (r) => r.trackNumber === parseInt(trackNumber)
      );
      if (correspondingTrack?.results?.[resultIndex - 1]?.id) {
        trackIdsToAdd.push(correspondingTrack.results[resultIndex - 1].id);
      }
    }
  }

  // 🆕 Add deduplication for Spotify track IDs before sending to playlist
  const uniqueSpotifyTrackIds = [...new Set(trackIdsToAdd)];

  console.log(`Original Spotify tracks to add: ${trackIdsToAdd.length}`);
  console.log(`Unique Spotify tracks to add: ${uniqueSpotifyTrackIds.length}`);

  if (trackIdsToAdd.length !== uniqueSpotifyTrackIds.length) {
    console.warn(`⚠️ Found ${trackIdsToAdd.length - uniqueSpotifyTrackIds.length} duplicate Spotify track(s) - removing duplicates`);
  }

  // 🆕 Combine existing track IDs with new successful ones
  const allSuccessfulTrackIds = [...existingTrackIds, ...newYoutubeTrackIds];

  const saveYoutubeTrackIds = await prisma.playlistMigration.upsert({
    where: {
      userId_playlistId_sourcePlatform_destinationPlatform: {
        userId: userId,
        playlistId: playlistId,
        sourcePlatform: "YOUTUBE",
        destinationPlatform: "SPOTIFY",
      },
    },
    update: {
      sourceTrackIds: allSuccessfulTrackIds, // 🆕 Use combined track IDs
      migrationCounter: {
        increment: 1,
      },
      updatedAt: new Date(),
      // Update sync fields for auto-sync compatibility
      lastSyncAt: new Date(),
      lastSyncStatus: "SUCCESS",
      lastSyncError: null,
    },
    create: {
      userId: userId,
      playlistId: playlistId,
      sourcePlatform: "YOUTUBE",
      destinationPlatform: "SPOTIFY",
      sourceTrackIds: allSuccessfulTrackIds, // 🆕 Use combined track IDs
      migrationCounter: 1,
      // Initialize sync fields
      lastSyncAt: new Date(),
      lastSyncStatus: "SUCCESS",
      lastSyncError: null,
    },
  });

  console.log("Migration data saved:", saveYoutubeTrackIds);

  const spotifyUserId = await prisma.spotifyData.findFirst({
    where: { userId },
    select: { id: true },
  });
  console.log("**********************************");
  console.log("Failed track details:", failedTrackDetails);
  console.log("spotifyUserId:", spotifyUserId);
  console.log("**********************************");

  if (spotifyUserId) {
    await prisma.spotifyData.update({
      where: { id: spotifyUserId.id },
      data: { retryToFindTracks: JSON.stringify(failedTrackDetails) },
    });
  }

  // 🆕 Use uniqueSpotifyTrackIds instead of trackIdsToAdd for the rest
  const spotifyChunks = chunkArray(uniqueSpotifyTrackIds, 40, 10);
  
  if (uniqueSpotifyTrackIds.length > 0) {
    await addToSptPlaylist(spotifyChunks, userId, playlistName);
  }

  return {
    bestMatches,
    trackIdsToAdd: uniqueSpotifyTrackIds, // 🆕 Return deduplicated list
    done: "done",
    numberOfTracksAdded: uniqueSpotifyTrackIds.length, // 🆕 Use deduplicated count
    failedTrackDetails,
  };
};

function chunkArray(
  arr: string[],
  firstChunkSize: number,
  subsequentChunkSize: number
): string[][] {
  const chunks: string[][] = [];
  if (arr.length === 0) return chunks;

  let startIndex = 0;

  if (arr.length > 90) {
    chunks.push(arr.slice(startIndex, startIndex + firstChunkSize));
    startIndex += firstChunkSize;
    while (startIndex < arr.length) {
      chunks.push(arr.slice(startIndex, startIndex + subsequentChunkSize));
      startIndex += subsequentChunkSize;
    }
  } else {
    chunks.push(arr);
  }

  return chunks;
}

function chunkTracksForLLM(spotifySearchResults, youtubeData): string[] {
  const allChunks: string[] = [];
  let currentChunk = "";

  for (const item of spotifySearchResults) {
    const { title, trackNumber, youtubeChannelName, results } = item;
    const youtubeTrack = youtubeData[trackNumber - 1];
    if (!youtubeTrack) continue;

    let formatted = `Track Number: ${trackNumber}\n`;
    formatted += `Title: ${title}\n`;
    formatted += `YouTube Channel Name: ${youtubeChannelName}\n`;
    formatted += `YouTube Video Duration: ${youtubeTrack.duration}\n`;
    formatted += `YouTube Video Published Date: ${youtubeTrack.publishedDate}\n`;
    formatted += `Results:\n`;

    results.forEach((r) => {
      const artistNames = Array.isArray(r.artists)
        ? r.artists
        : [r.artists || "Unknown Artist"];
      formatted += `  - Name: ${r.name}, Artist(s): ${artistNames.join(
        ", "
      )}\n`;
      formatted += `    Release Date: ${r.release_date}, Duration: ${r.duration}, Result Number: ${r.resultNumber}\n`;
    });

    if ((currentChunk + formatted).length > MAX_LLM_CHUNK_CHARS) {
      allChunks.push(currentChunk);
      currentChunk = formatted;
    } else {
      currentChunk += formatted + "\n";
    }
  }

  if (currentChunk.length > 0) allChunks.push(currentChunk);
  return allChunks;
}
