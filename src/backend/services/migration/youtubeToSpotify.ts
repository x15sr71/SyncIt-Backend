// services/migration/youtubeToSpotify.ts

import { searchYoutubeTracks } from '../search/searchSpotify/searchYoutube';
import { trimTrackDescriptions } from '../../utility/trim';
import { searchTracksOnSpotify } from '../search/searchSpotify/searchSpotify';
import { callOpenAIModel } from '../../openAI/getBestMatch';
import { addToSptPlaylist } from '../addTo/addToSptPlaylist';
import prisma from '../../../db/prisma';

const MAX_LLM_CHUNK_CHARS = 10000;

// Main function for scheduled auto-sync (matching the interface expected by ScheduledSyncService)
export async function migrateYoutubePlaylistToSpotify(
  userId: string,
  spotifyPlaylistId: string,
  youtubePlaylistId: string,
) {
  console.log(
    `[YouTube→Spotify] Starting migration: YouTube playlist ${youtubePlaylistId} → Spotify playlist ${spotifyPlaylistId}`,
  );

  try {
    // Use the existing service but with the playlist ID parameter structure expected by scheduled sync
    const result = await migrateYoutubeToSpotifyService(
      userId,
      youtubePlaylistId,
      spotifyPlaylistId, // Use as playlist name for now - you might want to fetch actual name
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
      error: 'YOUTUBE_TO_SPOTIFY_MIGRATION_FAILED',
      message: error?.message || 'Failed to migrate YouTube playlist to Spotify',
      statusCode: 502,
    };
  }
}

// Your existing service function (keeping it as-is for backward compatibility)
export const migrateYoutubeToSpotifyService = async (
  userId: string,
  playlistId: string,
  playlistName: string,
  destinationPlaylistId?: string,
) => {
  const youtubeUserId = await prisma.youTubeData.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!youtubeUserId) {
    throw new Error('YouTube user not found in database.');
  }

  const allYoutubeTracks = await searchYoutubeTracks(userId, playlistId);

  if (!allYoutubeTracks.success) {
    throw new Error(`Failed to fetch YouTube tracks: ${allYoutubeTracks.error}`);
  }

  const uniqueYoutubeTracks = allYoutubeTracks.data.filter(
    (track, index, self) => index === self.findIndex((t) => t.trackId === track.trackId),
  );

  console.log(
    `[Service] Original tracks: ${allYoutubeTracks.data.length}, Unique tracks: ${uniqueYoutubeTracks.length}`,
  );

  const formattedYoutubeTracks = trimTrackDescriptions(
    uniqueYoutubeTracks, // 🆕 Use deduplicated tracks
    750,
  );

  // 🆕 Extract YouTube track IDs from deduplicated tracks
  let youtubeTrackIds = uniqueYoutubeTracks.map((track) => track.trackId);
  console.log('Youtube Track IDs:', youtubeTrackIds);

  if (!formattedYoutubeTracks.length) {
    throw new Error('NO_YOUTUBE_TRACKS');
  }

  // 🆕 Check for existing tracks in playlistMigration
  const existingMigration = await prisma.playlistMigration.findFirst({
    where: {
      userId: userId,
      sourcePlaylistId: playlistId,
      sourcePlatform: 'YOUTUBE',
      destinationPlatform: 'SPOTIFY',
    },
    select: {
      sourceTrackIds: true,
    },
  });

  const existingTrackIds = existingMigration?.sourceTrackIds || [];
  console.log('Existing track IDs in migration:', existingTrackIds);

  // 🆕 Filter out tracks that already exist in the migration
  const newTracksOnly = uniqueYoutubeTracks.filter(
    (track) => !existingTrackIds.includes(track.trackId),
  );

  const formattedNewTracksOnly = trimTrackDescriptions(newTracksOnly, 750);

  console.log(`Total YouTube tracks: ${uniqueYoutubeTracks.length}`);
  console.log(`Already migrated tracks: ${existingTrackIds.length}`);
  console.log(`New tracks to process: ${newTracksOnly.length}`);

  // If no new tracks to process, skip the LLM processing
  if (!newTracksOnly.length) {
    console.log('No new tracks to migrate. All tracks already exist in migration.');
    return {
      bestMatches: {},
      trackIdsToAdd: [],
      done: 'done',
      numberOfTracksAdded: 0,
      failedTrackDetails: [],
      message: 'No new tracks to migrate',
    };
  }

  const searchChunks = chunkArray(formattedNewTracksOnly, 20, 10);
  let spotifySearchResults: any[] = [];
  let globalTrackNumber = 1;
  const bestMatches: Record<number, any> = {};
  const failedTrackDetails: string[] = [];

  for (const chunk of searchChunks) {
    const chunkResults = await searchTracksOnSpotify(chunk, globalTrackNumber, userId);
    spotifySearchResults = spotifySearchResults.concat(chunkResults);
    globalTrackNumber += chunk.length;
  }

  const llmChunks = chunkTracksForLLM(spotifySearchResults, newTracksOnly);

  // Accumulate globally-stable track numbers that got a successful LLM match.
  // chunk-local 1-based keys from the LLM response are mapped to global track
  // numbers via the chunk's trackNumbers list — fixes the chunk-local index bug.
  const successfulGlobalTrackNumbers = new Set<number>();

  for (const { text: chunkText, trackNumbers: chunkTrackNumbers } of llmChunks) {
    const messages = [
      {
        role: 'user',
        content: `Please identify the best matching Spotify search result for each track in the following list based solely on the current input.
                    Do not consider any previous interactions or suggestions.
                    Use these criteria: title, YouTube channel name, YouTube video duration, artist relevance, and release date.
                    Return a JSON object whose keys are the 1-based position of each track within THIS list (not global track numbers).
                    Format: { "1": <resultNumber>, "2": <resultNumber>, ... }
                    If a track does not have a match, use the string "error" as the value.
                    \n\n${chunkText}`,
      },
    ];

    const bestResultsForChunk = await callOpenAIModel(messages);

    let parsedBestResults: any;
    try {
      parsedBestResults = JSON.parse(bestResultsForChunk.content);
    } catch {
      console.warn('Skipping chunk: could not parse LLM response');
      continue;
    }

    for (const [chunkLocalKey, result] of Object.entries(parsedBestResults)) {
      const chunkLocalIdx = Number(chunkLocalKey); // 1-based within this chunk
      const globalTrackNumber = chunkTrackNumbers[chunkLocalIdx - 1];
      if (globalTrackNumber === undefined) continue;

      const youtubeTrack = newTracksOnly[globalTrackNumber - 1];
      if (!youtubeTrack) continue;

      if (typeof result === 'number' && Number.isInteger(result)) {
        successfulGlobalTrackNumbers.add(globalTrackNumber);
        bestMatches[globalTrackNumber] = result;
      } else {
        bestMatches[globalTrackNumber] = { error: true };
        failedTrackDetails.push(
          `Title: ${youtubeTrack.title}\nChannel: ${youtubeTrack.channelName}\nDuration: ${youtubeTrack.duration}\n`,
        );
      }
    }
  }

  // Collect Spotify track IDs for successfully matched entries
  const trackIdsToAdd: string[] = [];
  for (const [trackNumberStr, match] of Object.entries(bestMatches)) {
    const globalNum = Number(trackNumberStr);
    if (match && !(match as any).error) {
      const resultIndex = match as number;
      const correspondingTrack = spotifySearchResults.find((r) => r.trackNumber === globalNum);
      if (correspondingTrack?.results?.[resultIndex - 1]?.id) {
        trackIdsToAdd.push(correspondingTrack.results[resultIndex - 1].id);
      }
    }
  }

  const uniqueSpotifyTrackIds = [...new Set(trackIdsToAdd)];

  // Derive successfully matched YouTube track IDs using globally-stable indices
  const newYoutubeTrackIds = newTracksOnly
    .filter((_, i) => successfulGlobalTrackNumbers.has(i + 1))
    .map((track) => track.trackId);

  const spotifyUserId = await prisma.spotifyData.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (spotifyUserId) {
    await prisma.spotifyData.update({
      where: { id: spotifyUserId.id },
      data: { retryToFindTracks: JSON.stringify(failedTrackDetails) },
    });
  }

  const spotifyChunks = chunkArray(uniqueSpotifyTrackIds, 40, 10);

  // Add tracks FIRST, then persist state so failed adds are not recorded as migrated
  let usedDestinationPlaylistId: string | undefined = destinationPlaylistId;
  if (uniqueSpotifyTrackIds.length > 0) {
    const returnedPlaylistId = await addToSptPlaylist(
      spotifyChunks,
      userId,
      playlistName,
      destinationPlaylistId,
    );
    if (returnedPlaylistId) usedDestinationPlaylistId = returnedPlaylistId;
  }

  const allSuccessfulTrackIds = [...existingTrackIds, ...newYoutubeTrackIds];

  await prisma.playlistMigration.upsert({
    where: {
      userId_sourcePlaylistId_sourcePlatform_destinationPlatform: {
        userId,
        sourcePlaylistId: playlistId,
        sourcePlatform: 'YOUTUBE',
        destinationPlatform: 'SPOTIFY',
      },
    },
    update: {
      sourceTrackIds: allSuccessfulTrackIds,
      destinationPlaylistId: usedDestinationPlaylistId,
      migrationCounter: { increment: 1 },
      updatedAt: new Date(),
      lastSyncAt: new Date(),
      lastSyncStatus: 'SUCCESS',
      lastSyncError: null,
    },
    create: {
      userId,
      sourcePlaylistId: playlistId,
      sourcePlatform: 'YOUTUBE',
      destinationPlatform: 'SPOTIFY',
      sourceTrackIds: allSuccessfulTrackIds,
      destinationPlaylistId: usedDestinationPlaylistId,
      migrationCounter: 1,
      lastSyncAt: new Date(),
      lastSyncStatus: 'SUCCESS',
      lastSyncError: null,
    },
  });

  return {
    bestMatches,
    trackIdsToAdd: uniqueSpotifyTrackIds,
    done: 'done',
    numberOfTracksAdded: uniqueSpotifyTrackIds.length,
    failedTrackDetails,
  };
};

function chunkArray<T>(
  arr: T[],
  firstChunkSize: number,
  subsequentChunkSize: number,
): T[][] {
  const chunks: T[][] = [];
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

function chunkTracksForLLM(
  spotifySearchResults: any[],
  youtubeData: any[],
): Array<{ text: string; trackNumbers: number[] }> {
  const allChunks: Array<{ text: string; trackNumbers: number[] }> = [];
  let currentChunk = '';
  let currentTrackNumbers: number[] = [];

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

    results.forEach((r: any) => {
      const artistNames = Array.isArray(r.artists) ? r.artists : [r.artists || 'Unknown Artist'];
      formatted += `  - Name: ${r.name}, Artist(s): ${artistNames.join(', ')}\n`;
      formatted += `    Release Date: ${r.release_date}, Duration: ${r.duration}, Result Number: ${r.resultNumber}\n`;
    });

    if ((currentChunk + formatted).length > MAX_LLM_CHUNK_CHARS) {
      allChunks.push({ text: currentChunk, trackNumbers: currentTrackNumbers });
      currentChunk = formatted;
      currentTrackNumbers = [trackNumber];
    } else {
      currentChunk += formatted + '\n';
      currentTrackNumbers.push(trackNumber);
    }
  }

  if (currentChunk.length > 0) allChunks.push({ text: currentChunk, trackNumbers: currentTrackNumbers });
  return allChunks;
}
