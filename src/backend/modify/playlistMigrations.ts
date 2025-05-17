import { searchYoutubeTracks } from "../extractTracks/youtubeExt";
import { trimTrackDescriptions } from "../../OAuth/utility/trim";
import { searchTracksOnSpotify } from "./searchSpotify/searchSpotify";
import { callOpenAIModel } from "../openAI/getBestMatch";
import { addToSptLikePlaylist } from "./spotify/addToSptLikePlaylist";
import prisma from "../../db";

// Token-safe chunk size for OpenAI (approx. char-based)
const MAX_LLM_CHUNK_CHARS = 10000;

export const migrateWholeYoutubePlaylistToSpotifyplaylist = async (
  req,
  res
) => {
  try {
    console.log(
      "Migrating YouTube playlist to Spotify for session:",
      req.session.id
    );

    const youtubeUserId = await prisma.youTubeData.findFirst({
      where: { userId: req.session.id },
      select: { id: true },
    });

    if (!youtubeUserId) {
      return res
        .status(400)
        .json({ error: "YouTube user not found in database." });
    }

    const allYoutubeTracks = await searchYoutubeTracks();
    const formattedYoutubeTracks = trimTrackDescriptions(
      allYoutubeTracks.data,
      750
    );

    if (!formattedYoutubeTracks.length) {
      return res
        .status(400)
        .json({ error: "No tracks found in YouTube playlist." });
    }

    const searchChunks = chunkArray(formattedYoutubeTracks, 20, 10);
    let spotifySearchResults = [];
    let globalTrackNumber = 1;
    let bestMatches = {};
    let failedTrackDetails = [];

    for (let i = 0; i < searchChunks.length; i++) {
      const chunk = searchChunks[i];
      const chunkResults = await searchTracksOnSpotify(
        chunk,
        globalTrackNumber
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

      try {
        const bestResultsForChunk = await callOpenAIModel(messages);
        let parsedBestResults = {};

        try {
          parsedBestResults = JSON.parse(bestResultsForChunk.content);
        } catch (err) {
          console.warn("Failed to parse OpenAI response, skipping chunk:", err);
          continue;
        }

        for (const trackNumber in parsedBestResults) {
          const result = parsedBestResults[trackNumber];
          const youtubeTrack = allYoutubeTracks.data[Number(trackNumber) - 1];

          if (!youtubeTrack) {
            console.warn(
              `Track number ${trackNumber} does not exist in YouTube data`
            );
            continue;
          }

          if (result?.error) {
            bestMatches[trackNumber] = {
              error: `No match found for track ${trackNumber}`,
            };
            const trackDetails =
              `Title: ${youtubeTrack.title}\n` +
              `YouTube Channel Name: ${youtubeTrack.channelName}\n` +
              `YouTube Video Duration: ${youtubeTrack.duration}\n` +
              `YouTube Video Published Date: ${youtubeTrack.publishedDate}\n`;
            failedTrackDetails.push(trackDetails);
          } else {
            bestMatches[trackNumber] = result;
          }
        }
      } catch (error) {
        console.error("Error getting best matches from OpenAI:", error);
        return res
          .status(500)
          .json({ error: "Error getting best matches from OpenAI" });
      }
    }

    const trackIdsToAdd: string[] = [];
    for (const trackNumber in bestMatches) {
      const match = bestMatches[trackNumber];

      if (!match?.error) {
        const resultIndex = match;
        const correspondingTrack = spotifySearchResults.find(
          (result) => result.trackNumber === parseInt(trackNumber)
        );

        if (correspondingTrack && correspondingTrack.results[resultIndex - 1]) {
          const trackId = correspondingTrack.results[resultIndex - 1].id;
          if (trackId) {
            trackIdsToAdd.push(trackId);
          } else {
            console.warn(`No track ID found for track number ${trackNumber}`);
          }
        } else {
          console.warn(
            `Could not find matching result for track number ${trackNumber}`
          );
        }
      }
    }

    await prisma.youTubeData.update({
      where: { id: youtubeUserId.id },
      data: { retryToFindTracks: JSON.stringify(failedTrackDetails) },
    });

    try {
      const spotifyChunks = chunkArray(trackIdsToAdd, 40, 10);
      console.log(
        "Chunks prepared for adding to Spotify:",
        spotifyChunks.length
      );
      await addToSptLikePlaylist(spotifyChunks);
    } catch (error) {
      console.error("Error adding to Spotify:", error);
      return res
        .status(500)
        .json({ error: "Failed to add tracks to liked playlist" });
    }

    res.json({
      bestMatches,
      trackIdsToAdd,
      done: "done",
      numberOfTracksAdded: trackIdsToAdd.length,
      failedTrackDetails,
    });
  } catch (error) {
    console.error(
      "Error in migrateWholeYoutubePlaylistToSpotifyplaylist:",
      error
    );
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
};

// ✅ Function to split an array into chunks.
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

// ✅ Function to safely chunk tracks for LLM based on max char size
function chunkTracksForLLM(spotifySearchResults, youtubeData): string[] {
  const allChunks: string[] = [];
  let currentChunk = "";

  for (const item of spotifySearchResults) {
    const { title, trackNumber, youtubeChannelName, results } = item;
    const youtubeTrack = youtubeData[trackNumber - 1];
    if (!youtubeTrack) continue;

    let formattedResult = `Track Number: ${trackNumber}\n`;
    formattedResult += `Title: ${title}\n`;
    formattedResult += `YouTube Channel Name: ${youtubeChannelName}\n`;
    formattedResult += `YouTube Video Duration: ${youtubeTrack.duration}\n`;
    formattedResult += `YouTube Video Published Date: ${youtubeTrack.publishedDate}\n`;
    formattedResult += `Results:\n`;

    results.forEach((result) => {
      const artistNames = Array.isArray(result.artists)
        ? result.artists
        : [result.artists || "Unknown Artist"];
      formattedResult += `  - Name: ${
        result.name
      }, Artist(s): ${artistNames.join(", ")},\n`;
      formattedResult += `    Release Date: ${result.release_date}, Duration: ${result.duration}, Result Number: ${result.resultNumber}\n`;
    });

    if ((currentChunk + formattedResult).length > MAX_LLM_CHUNK_CHARS) {
      allChunks.push(currentChunk);
      currentChunk = formattedResult;
    } else {
      currentChunk += formattedResult + "\n";
    }
  }

  if (currentChunk.length > 0) {
    allChunks.push(currentChunk);
  }

  return allChunks;
}
