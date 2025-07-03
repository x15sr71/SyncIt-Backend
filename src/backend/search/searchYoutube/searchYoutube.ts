import axios from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../../OAuth/tokenManagement/youtubeTokensUtil';

const MAX_RETRIES = 3; // Maximum number of retries for failed requests
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';

const validateTracks = (tracks) => {
    if (!tracks || tracks.length === 0) {
        throw new Error('Invalid or empty tracks array');
    }
};

const getApiKey = () => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        throw new Error('YouTube API key is missing. Please set it in your environment variables.');
    }
    return apiKey;
};

const createSearchQuery = ({ trackName, artists, albumName }) => {
    return `${trackName || ''} ${artists || ''} ${albumName || ''}`.trim();
};

const handleSearchError = async (error, track) => {
    if (error.response) {
        const { status, data } = error.response;
        console.error(`Error response data for ${track.trackName}:`, JSON.stringify(data, null, 2));

        if (status === 401) {
            console.warn('Access token expired or invalid. Refreshing token...');
            try {
                await refreshYoutubeAccessToken();
                return await get_YoutubeAccessToken(); // Get new access token after refresh
            } catch (refreshError) {
                console.error('Failed to refresh access token:', refreshError.message);
                return null; // Indicate failure to refresh
            }
        } else if (status === 403 && data.error && data.error.errors[0].reason === 'quotaExceeded') {
            console.error('Quota exceeded. Please check your quota usage or request an increase.');
        } else {
            console.error(`Error searching for track ${track.trackName}:`, error.message);
        }
    } else {
        console.error(`Network error searching for track ${track.trackName}:`, error.message);
    }
    return null; // Indicate failure to handle the error
};

const performSearch = async (track, apiKey, accessToken) => {
    const searchQuery = createSearchQuery(track);
    
    // Check if the search query is null, empty, or undefined
    if (!searchQuery) {
        console.error(`Search query for track ${track.trackName} is null or empty. Skipping search.`);
        return { trackName: track.trackName, results: [] }; // Return empty results
    }

    console.log(`Searching for query: ${searchQuery}`);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await axios.get(YOUTUBE_API_URL, {
                params: {
                    part: 'snippet',
                    q: searchQuery,
                    type: 'video',
                    videoCategoryId: '10', // Category ID for Music
                    maxResults: 3, // Adjust this as necessary
                    key: apiKey,
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            console.log(`Search results for track ${track.trackName}:`, response.data.items);
            return { trackName: track.trackName, results: response.data.items };
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
    return { trackName: track.trackName, results: [] }; // Return empty result if retries fail
};

export const searchTracksOnYoutube = async (tracks) => {
    validateTracks(tracks);
    const apiKey = getApiKey();
    let accessToken = await get_YoutubeAccessToken();

    const searchPromises = tracks.map((track) => performSearch(track, apiKey, accessToken));
    const results = await Promise.allSettled(searchPromises);

    return results.map((result, index) => {
        const query = createSearchQuery(tracks[index]); // Create the query for this track
        if (result.status === 'fulfilled') {
            const { trackName, results: searchResults } = result.value; // Destructure trackName and searchResults
            return { trackName, query, results: searchResults }; // Include trackName, query, and results in the return
        } else {
            console.error(`Error searching for track ${tracks[index].trackName}:`, result.reason);
            return { trackName: tracks[index].trackName, query, results: [] }; // Return trackName and empty results on error
        }
    });
};

