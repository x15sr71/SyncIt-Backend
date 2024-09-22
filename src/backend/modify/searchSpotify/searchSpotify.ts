import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';
import { convertDurationToFormattedString } from '../../../OAuth/utility/convertDuration';

const MAX_RETRIES = 3; // Maximum number of retries for failed requests
const SPOTIFY_API_URL = 'https://api.spotify.com/v1/search';

// Validate that the tracks array is not empty or invalid
const validateTracks = (tracks) => {
    if (!tracks || tracks.length === 0) {
        throw new Error('Invalid or empty tracks array');
    }
};

// Create the search query string for Spotify
const createSearchQuery = ({ title, videoChannelTitle }) => {
    return `${title} ${videoChannelTitle}`.trim();
};

// Handle errors encountered during the search request
const handleSearchError = async (error, track) => {
    if (error.response) {
        const { status, data } = error.response;
        console.error(`Error response data for ${track.title}:`, JSON.stringify(data, null, 2));

        // If the access token is expired or invalid, attempt to refresh it
        if (status === 401) {
            console.warn('Access token expired or invalid. Refreshing token...');
            try {
                await refreshSpotifyToken();
                return await get_SpotifyAccessToken(); // Get new access token after refresh
            } catch (refreshError) {
                console.error('Failed to refresh access token:', refreshError.message);
                return null; // Indicate failure to refresh
            }
        } else if (status === 403 && data.error && data.error.message === 'quotaExceeded') {
            console.error('Quota exceeded. Please check your quota usage or request an increase.');
        } else {
            console.error(`Error searching for track ${track.title}:`, error.message);
        }
    } else {
        console.error(`Network error searching for track ${track.title}:`, error.message);
    }
    return null; // Indicate failure to handle the error
};

// Perform the actual search request to Spotify
const performSearch = async (track, accessToken) => {
    const searchQuery = createSearchQuery(track);

    // Check if the search query is valid
    if (!searchQuery) {
        console.error(`Search query for track ${track.title} is null or empty. Skipping search.`);
        return { title: track.title, youtubeChannelName: track.videoChannelTitle, results: [] }; // Return empty results
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await axios.get(SPOTIFY_API_URL, {
                params: {
                    q: searchQuery,
                    type: 'track',
                    limit: 3, // Adjust this as necessary
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            return { title: track.title, youtubeChannelName: track.videoChannelTitle, results: response.data.tracks.items };
        } catch (error) {
            const newAccessToken = await handleSearchError(error, track);
            if (newAccessToken) {
                accessToken = newAccessToken; // Update access token if refreshed
                continue; // Retry with the updated token
            } else {
                break; // Stop retrying on failure
            }
        }
    }
    return { title: track.title, youtubeChannelName: track.videoChannelTitle, results: [] }; // Return empty result if retries fail
};

// Search for tracks on Spotify using an access token
export const searchTracksOnSpotify = async (tracks, globalTrackNumber) => {
    validateTracks(tracks); // Ensure valid tracks array
    let accessToken = await get_SpotifyAccessToken(); // Fetch initial access token

    const searchPromises = tracks.map((track, index) => performSearch(track, accessToken));
    const results = await Promise.allSettled(searchPromises);

    return results.map((result, index) => {
        const query = createSearchQuery(tracks[index]); // Create the query for this track
        const trackNumber = globalTrackNumber + index; // Incrementing track number globally
        const youtubeChannelName = tracks[index].videoChannelTitle; // Get youtubeChannelName

        if (result.status === 'fulfilled') {
            const { title, results: searchResults } = result.value; // Destructure title and searchResults

            const formattedResults = searchResults.map((track, resultIndex) => {
                const artistNames = Array.isArray(track.artists) && track.artists.length > 0
                    ? track.artists.map(artist => artist.name).filter(name => name).join(', ')
                    : 'Unknown Artist';

                const formattedDuration = convertDurationToFormattedString(track.duration_ms);

                return {
                    id: track.id,
                    trackNumber, // Use global trackNumber here
                    name: track.name,
                    artists: artistNames,
                    release_date: track.album ? track.album.release_date : 'N/A',
                    duration: formattedDuration, // Include formatted duration
                    resultNumber: resultIndex + 1 // Incrementing result number
                };
            });

            return { title, trackNumber, youtubeChannelName, query, results: formattedResults }; // Include youtubeChannelName in the return
        } else {
            console.error(`Error searching for track ${tracks[index].title}:`, result.reason);
            return { title: tracks[index].title, youtubeChannelName, query, results: [] }; // Return title and empty results on error
        }
    });
};

