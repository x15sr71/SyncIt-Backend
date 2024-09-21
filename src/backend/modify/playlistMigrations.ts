import { query } from "express";
import { searchSpotifyTracks } from "../extractTracks/spotifyExt"
import { searchTracksOnYoutube } from "./searchYoutube/searchYoutube"

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
            `Result: ${index + 1}\n- Video Title: ${result.title}\n  Channel: ${result.channelTitle}\n  Published At: ${result.publishedAt}\n}`
        ).join('\n\n');
    
        return `Track Name: ${track.trackName}\nResults:\n${resultsStr}`;
    }).join('\n\n');
        
    console.log(sendToLLM);
    
    res.json({
        done: "done"
    })
}