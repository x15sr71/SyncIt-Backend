import { searchSpotifyTracks } from "../extractTracks/spotifyExt";
import { searchTracksOnYoutube } from "./searchYoutube/searchYoutube";
import { searchYoutubeTracks } from "../extractTracks/youtubeExt";
import { trimTrackDescriptions } from "../../OAuth/utility/trim";
import { searchTracksOnSpotify } from "./searchSpotify/searchSpotify";
import { chunkArray } from "../../OAuth/utility/chunkArray";
import { callOpenAIModel } from "../openAI/getBestMatch";
import { addToSptLikePlaylist } from './spotify/addToSptLikePlaylist'; // Adjust the import path accordingly

export const migrateWholeSpotifyPlaylistToYoutubeplaylist = async (req, res) => {
    const allSpotifyTracks = await searchSpotifyTracks();
    console.log(allSpotifyTracks);

    const youtubeSearchResult = await searchTracksOnYoutube(allSpotifyTracks.data);

    const formattedResults = youtubeSearchResult.map((trackResult, index) => {
        const resultsArray = trackResult.results.map(result => ({
            title: result.snippet.title,
            channelTitle: result.snippet.channelTitle,
            publishedAt: result.snippet.publishedAt,
        }));

        return {
            trackName: trackResult.trackName,
            query: trackResult.query,
            results: resultsArray,
        };
    });

    const sendToLLM = `Please select the best result for each track based on the information provided below:\n\n` +
        formattedResults.map(track => {
            const resultsStr = track.results.map((result, index) => 
                `Result: ${index + 1}\n- Video Title: ${result.title}\n  Channel: ${result.channelTitle}\n  Published At: ${result.publishedAt}\n`
            ).join('\n\n');

            return `Track Name: ${track.trackName}\nResults:\n${resultsStr}`;
        }).join('\n\n');

    console.log(sendToLLM);

    res.json({
        done: "done"
    });
};

export const migrateWholeYoutubePlaylistToSpotifyplaylist = async (req, res) => {
    try {
        const allYoutubeTracks = await searchYoutubeTracks();
        const formattedYoutubeTracks = trimTrackDescriptions(allYoutubeTracks.data, 750);

        // Split the formattedYoutubeTracks into chunks of 20
        const chunks = chunkArray(formattedYoutubeTracks, 20);

        let spotifySearchResults = [];
        let globalTrackNumber = 1; // Start the global track number at 1
        let bestMatches = {}; // Object to store best matching results

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
                    content: `For each track, identify the best matching Spotify search result based on the following criteria: title, YouTube channel name, YouTube video duration, artist relevance, and release date. 
                    Please return the results strictly in this JSON format: {
                        "1": <resultNumber>,
                        "2": <resultNumber>,
                        ...
                    }
                    Ensure the output is valid JSON and does not include any additional text or formatting. If you cannot determine the best match for a track, return { "error": "Unable to find best match for track <trackNumber>" } instead.
                    \n\n${sendToLLM}`
                }
            ];

            // Call the OpenAI API for this chunk
            try {
                const bestResultsForChunk = await callOpenAIModel(messages);
                const parsedBestResults = JSON.parse(bestResultsForChunk.content); // Parse the content

                // Log the tokens used
                console.log('Tokens used in OpenAI response:', bestResultsForChunk.usage.total_tokens);
                console.log('OpenAI Response JSON:', parsedBestResults); // Log the full JSON response

                // Ensure that parsedBestResults only contains valid data
                for (const trackNumber in parsedBestResults) {
                    if (parsedBestResults[trackNumber].error) {
                        bestMatches[trackNumber] = {
                            error: `Unable to find best match for track ${trackNumber}`
                        };
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
                console.log(`Error for track ${trackNumber}: ${match.error}`);
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

        // Now `trackIdsToAdd` contains the IDs of the tracks to be added to the playlist
        console.log('Track IDs to add to the playlist:', trackIdsToAdd);

        // Call the function to add tracks to the Spotify liked playlist
        try {
            await addToSptLikePlaylist(trackIdsToAdd);
        } catch (error) {
            console.error('Error adding tracks to Spotify liked playlist:', error);
            return res.status(500).json({ error: 'Failed to add tracks to liked playlist' });
        }

        res.json({
            bestMatches,
            trackIdsToAdd, // Return the IDs of the tracks to add
            done: 'done'
        });
    } catch (error) {
        console.error('Error in migrateWholeYoutubePlaylistToSpotifyplaylist:', error);
        return res.status(500).json({ error: 'An unexpected error occurred' });
    }
};









