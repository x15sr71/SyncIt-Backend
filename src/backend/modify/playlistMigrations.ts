import { searchYoutubeTracks } from "../extractTracks/youtubeExt";
import { trimTrackDescriptions } from "../../OAuth/utility/trim";
import { searchTracksOnSpotify } from "./searchSpotify/searchSpotify";
import { chunkArray } from "../../OAuth/utility/chunkArray";
import { callOpenAIModel } from "../openAI/getBestMatch";
import { addToSptLikePlaylist } from './spotify/addToSptLikePlaylist'; // Adjust the import path accordingly
import prisma from "../../db";

export const migrateWholeYoutubePlaylistToSpotifyplaylist = async (req, res) => {
    try {
        const allYoutubeTracks = await searchYoutubeTracks();
        const formattedYoutubeTracks = trimTrackDescriptions(allYoutubeTracks.data, 750);

        // Split the formattedYoutubeTracks into chunks of 20
        const chunks = chunkArray(formattedYoutubeTracks, 20);

        let spotifySearchResults = [];
        let globalTrackNumber = 1; // Start the global track number at 1
        let bestMatches = {}; // Object to store best matching results
        let failedTrackDetails = []; // Array to store details of tracks that couldn't be matched

        // Process each chunk of 20 tracks sequentially
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`Processing chunk ${i + 1} of ${chunks.length}`);

            // Await each batch of 20 track searches, passing the global track number
            const chunkResults = await searchTracksOnSpotify(chunk, globalTrackNumber);
            spotifySearchResults = spotifySearchResults.concat(chunkResults); // Accumulate results
            console.log(spotifySearchResults);

            // Increment the global track number by the size of the current chunk
            globalTrackNumber += chunk.length;

            // Prepare the string to send to OpenAI for each chunk
            const sendToLLM = chunkResults.map((item) => {
                const { title, trackNumber, youtubeChannelName, results } = item;
                const youtubeTrack = allYoutubeTracks.data[trackNumber - 1]; // Get the corresponding track for duration and published date

                // Create a formatted string for each item
                let formattedResult = `Track Number: ${trackNumber}\n`;
                formattedResult += `Title: ${title}\n`;
                formattedResult += `YouTube Channel Name: ${youtubeChannelName}\n`;
                formattedResult += `YouTube Video Duration: ${youtubeTrack.duration}\n`;
                formattedResult += `YouTube Video Published Date: ${youtubeTrack.publishedDate}\n`;
                formattedResult += `Results:\n`;

                results.forEach((result) => {
                    const artistNames = Array.isArray(result.artists) ? result.artists : [result.artists || 'Unknown Artist'];
                    formattedResult += `  - Name: ${result.name}, Artist(s): ${artistNames.join(', ')},\n`;
                    formattedResult += `    Release Date: ${result.release_date}, Duration: ${result.duration}, Result Number: ${result.resultNumber}\n`;
                });

                return formattedResult;
            }).join('\n');

            // Prepare messages array for OpenAI API
            const messages = [
                {
                    role: 'user',
                    content: `Please identify the best matching Spotify search result for each track in the following list based solely on the current input. 
                    Do not consider any previous interactions or suggestions. 
                    Use these criteria: title, YouTube channel name, YouTube video duration, artist relevance, and release date. 
                    Return the results in this format: {
                        "1": <resultNumber>,
                        "2": <resultNumber>,
                        ...
                    } 
                    If a track does not have a match, respond with { "error": "Unable to find best match for track <trackNumber>" }.
                    \n\n${sendToLLM}` // Send the current chunk of tracks
                }
            ];
            
            // Call the OpenAI API for this chunk
            try {
                const bestResultsForChunk = await callOpenAIModel(messages);
                const parsedBestResults = JSON.parse(bestResultsForChunk.content); // Parse the content

                // Log the tokens used
                //console.log('Tokens used in OpenAI response:', bestResultsForChunk.usage.total_tokens);
                //console.log('OpenAI Response JSON:', parsedBestResults); // Log the full JSON response

                // Ensure that parsedBestResults only contains valid data
                for (const trackNumber in parsedBestResults) {
                    if (parsedBestResults[trackNumber].error) {
                        bestMatches[trackNumber] = {
                            error: `Unable to find best match for track ${trackNumber}`
                        };

                        // Store the details of the track for which no match was found
                        const youtubeTrack = allYoutubeTracks.data[Number(trackNumber) - 1]; // Get the corresponding YouTube track details
                        const trackDetails = `Title: ${youtubeTrack.title}\n` +
                                             `YouTube Channel Name: ${youtubeTrack.channelName}\n` +
                                             `YouTube Video Duration: ${youtubeTrack.duration}\n` +
                                             `YouTube Video Published Date: ${youtubeTrack.publishedDate}\n`;

                        failedTrackDetails.push(trackDetails); // Store track details
                    } else {
                        bestMatches[trackNumber] = parsedBestResults[trackNumber];
                    }
                }
            } catch (error) {
                console.error('Error getting best matches:', error);
                return res.status(500).json({ error: 'Error getting best matches from OpenAI' });
            }
        }

        console.log('Best Matches:', bestMatches); // Log the final result

        // Create an array to hold the track IDs of the best matches
        const trackIdsToAdd = [];

        // Iterate through the bestMatches object
        for (const trackNumber in bestMatches) {
            const match = bestMatches[trackNumber];

            // Check if the match is an error or a valid result
            if (match.error) {
                //console.log(`Error for track ${trackNumber}: ${match.error}`);
            } else {
                // Get the track result for the current trackNumber
                const resultIndex = match; // Get the result number from OpenAI's response

                // Find the corresponding track in spotifySearchResults
                const correspondingTrack = spotifySearchResults.find(
                    (result) => result.trackNumber === parseInt(trackNumber)
                );

                if (correspondingTrack && correspondingTrack.results[resultIndex - 1]) {
                    const trackId = correspondingTrack.results[resultIndex - 1].id; // Get the track ID
                    if (trackId) {
                        trackIdsToAdd.push(trackId); // Add the track ID to the array
                    }
                } else {
                    console.log(`No valid result found for track ${trackNumber}`);
                }
            }
        }

        // Log the number of tracks that were added
        console.log(`Number of tracks added: ${trackIdsToAdd.length}`);

        // Log the failed track details
        console.log('Tracks that were not matched by the LLM:');
        failedTrackDetails.forEach(detail => console.log(detail)); // Log each track detail
        const failedTrackDetailsString = JSON.stringify(failedTrackDetails) || {};

        await prisma.youTubeData.update({
            where: {
                id: req.session.id
            },
            data: {
                retryToFindTracks: failedTrackDetailsString
            }
        })

        // Call the function to add tracks to the Spotify liked playlist
        try {
            
           async function chunkArray(arr: any[], firstChunkSize: number, subsequentChunkSize: number) {
                const chunks: any[][] = [];
              
                // Check if array length exceeds 90
                if (arr.length > 90) {
                  let startIndex = 0;
                  
                  // First chunk with 'firstChunkSize' items
                  chunks.push(arr.slice(startIndex, startIndex + firstChunkSize));
                  startIndex += firstChunkSize;
              
                  // Create subsequent chunks with 'subsequentChunkSize' items
                  while (startIndex < arr.length) {
                    const chunk = arr.slice(startIndex, startIndex + subsequentChunkSize);
                    chunks.push(chunk);
                    startIndex += subsequentChunkSize;
                  }
                }
              console.log(chunks);
              
                await addToSptLikePlaylist(chunks);
              }
              
              const chunks = chunkArray(trackIdsToAdd, 80, 10);
              

            
        } catch (error) {
            console.error('Error adding tracks to Spotify liked playlist:', error);
            return res.status(500).json({ error: 'Failed to add tracks to liked playlist' });
        }

        res.json({
            bestMatches,
            trackIdsToAdd, // Return the IDs of the tracks to add
            done: 'done',
            numberOfTracksAdded: trackIdsToAdd.length, // Add the number of tracks added in the response
            failedTrackDetails // Return the details of tracks that were not matched
        });
    } catch (error) {
        console.error('Error in migrateWholeYoutubePlaylistToSpotifyplaylist:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
};
