import { searchYoutubeTracks } from "../search/searchSpotify/searchYoutube";
import { trimTrackDescriptions } from "../../utility/trim";
import { searchTracksOnSpotify } from "../search/searchSpotify/searchSpotify";
import { callOpenAIModel } from "../../openAI/getBestMatch";
import { addToSptLikePlaylist } from "../addTo/addToSptLikePlaylist";
import prisma from "../../../db";

const MAX_LLM_CHUNK_CHARS = 10000;

export const migrateYoutubeToSpotifyService = async (userId: string) => {
  const youtubeUserId = await prisma.youTubeData.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!youtubeUserId) {
    throw new Error("YouTube user not found in database.");
  }

  const allYoutubeTracks = await searchYoutubeTracks(userId);
  const formattedYoutubeTracks = trimTrackDescriptions(
    allYoutubeTracks.data,
    750
  );

  if (!formattedYoutubeTracks.length) {
    throw new Error("No tracks found in YouTube playlist.");
  }

  const searchChunks = chunkArray(formattedYoutubeTracks, 20, 10);
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
    allYoutubeTracks.data
  );

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
    } catch {
      console.warn("Skipping chunk: could not parse LLM response");
      continue;
    }

    for (const trackNumber in parsedBestResults) {
      const result = parsedBestResults[trackNumber];
      const youtubeTrack = allYoutubeTracks.data[Number(trackNumber) - 1];

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

  const spotifyUserId = await prisma.spotifyData.findFirst({
    where: { userId },
    select: { id: true },
  });
  console.log("**********************************");
  console.log("Failed track details:", failedTrackDetails);
  console.log("spotifyUserId:", spotifyUserId);
  console.log("**********************************");

  await prisma.spotifyData.update({
    where: { id: spotifyUserId.id },
    data: { retryToFindTracks: JSON.stringify(failedTrackDetails) },
  });

  const spotifyChunks = chunkArray(trackIdsToAdd, 40, 10);
  await addToSptLikePlaylist(spotifyChunks, userId);

  return {
    bestMatches,
    trackIdsToAdd,
    done: "done",
    numberOfTracksAdded: trackIdsToAdd.length,
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
