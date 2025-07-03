import { searchTracksOnYoutube } from "../../backend/search/searchYoutube/searchYoutube";

export const organizeTrackSearchResults = (tracks, searchResults) => {
    if (!tracks || !searchResults || tracks.length !== searchResults.length) {
        throw new Error('Invalid tracks or search results');
    }

    // Organize the data in a clear format for LLM
    const organizedData = tracks.map((track, index) => {
        const results = searchResults[index].results.map((result, idx) => ({
            rank: idx + 1,
            videoId: result.id.videoId,
            title: result.snippet.title,
            description: result.snippet.description,
            channelTitle: result.snippet.channelTitle,
            publishedAt: result.snippet.publishedAt,
        }));

        return {
            trackInfo: {
                trackId: track.trackId,
                trackName: track.trackName,
                artists: track.artists,
                albumName: track.albumName,
                albumType: track.albumType,
                releaseDate: track.releaseDate,
                durationMs: track.durationMs,
            },
            searchResults: results,
        };
    });

    return organizedData;
};

// Example usage of the function
const tracks = [
        {
            "TrackNumber": 11,
            "TrackID": "09CtPGIpYB4BrO8qb1RGsF",
            "TrackName": "Sorry",
            "Artists": "Justin Bieber",
            "AlbumName": "Purpose (Deluxe)",
            "AlbumType": "album",
            "ReleaseDate": "2015-11-13",
            "DurationMs": 200786
        },
        {
            "TrackNumber": 12,
            "TrackID": "01aTsQoKoeXofSTvKuunzv",
            "TrackName": "Lean On",
            "Artists": "Major Lazer, DJ Snake, MØ",
            "AlbumName": "Peace Is The Mission",
            "AlbumType": "album",
            "ReleaseDate": "2015-06-01",
            "DurationMs": 176561
        },
        {
            "TrackNumber": 13,
            "TrackID": "4jTiyLlOJVJj3mCr7yfPQD",
            "TrackName": "This Could Be Us",
            "Artists": "Rae Sremmurd",
            "AlbumName": "SremmLife",
            "AlbumType": "album",
            "ReleaseDate": "2015-01-06",
            "DurationMs": 206306
        },
        {
            "TrackNumber": 14,
            "TrackID": "3GNks1GsKDn9wKGF9pDpE5",
            "TrackName": "midnight city (slowed reverb)",
            "Artists": "ciaffa, fedo DJ, kadirhho",
            "AlbumName": "midnight city (slowed reverb)",
            "AlbumType": "single",
            "ReleaseDate": "2023-11-07",
            "DurationMs": 295103
        },
        {
            "TrackNumber": 15,
            "TrackID": "2wmQfaHp4zbqQkbf5nu5SF",
            "TrackName": "Why We Lose",
            "Artists": "Cartoon, Jéja, Coleman Trapp",
            "AlbumName": "Why We Lose",
            "AlbumType": "single",
            "ReleaseDate": "2015-06-11",
            "DurationMs": 197485
        },
        {
            "TrackNumber": 16,
            "TrackID": "5xU2dVnkUtGdhoK0mY4A8n",
            "TrackName": "Good Day for Dreaming",
            "Artists": "Ruelle",
            "AlbumName": "Good Day for Dreaming",
            "AlbumType": "single",
            "ReleaseDate": "2020-10-09",
            "DurationMs": 236649
        }    
];

export const queryDataForYoutube = async function (req, res) {

    try{
        const searchResults = await searchTracksOnYoutube(tracks)

        // Organize data
    const organizedData = organizeTrackSearchResults(tracks, searchResults);

    console.log(JSON.stringify(organizedData, null, 2));

    return organizedData;
    res.json({
        done: "done"
    })
    }
    catch(error) {
        console.log("Error while searching YouTube: ", error.response.data)
        throw(error)
    }
    

    
}




