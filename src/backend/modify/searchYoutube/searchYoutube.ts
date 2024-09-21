import axios from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../../OAuth/tokenManagement/youtubeTokensUtil';

const MAX_RETRIES = 3; // Maximum number of retries for failed requests

export const searchTracksOnYoutube = async (tracks) => {
    if (!tracks || tracks.length === 0) {
        throw new Error('Invalid or empty tracks array');
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        throw new Error('YouTube API key is missing. Please set it in your environment variables.');
    }

    // Function to create search queries based on track metadata
    const createSearchQuery = (track) => {
        const { TrackName, Artists, AlbumName } = track;
        const query = `${TrackName || ''} ${Artists || ''} ${AlbumName || ''}`.trim();
        return query; // Encode the search query to avoid special character issues
    };

    const performSearch = async (track) => {
        let accessToken = await get_YoutubeAccessToken(); // Fetch the latest access token
        const searchQuery = createSearchQuery(track);

        console.log(`Searching for query: ${searchQuery}`); // Log the query being searched

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        q: searchQuery,
                        type: 'video',
                        videoCategoryId: '10', // Category ID for Music
                        maxResults: 5, // Increased results for testing
                        key: apiKey
                    },
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                });

                console.log(`Search results for track ${track.trackName}:`, response.data.items);

                // Return search result
                return {
                    trackName: track.trackName,
                    results: response.data.items
                };

            } catch (error) {
                if (error.response) {
                    const { status, data } = error.response;
                    console.error(`Error response data: ${JSON.stringify(data, null, 2)}`); // Log full error response for debugging

                    if (status === 401) { // Unauthorized
                        console.warn('Access token expired or invalid. Refreshing token...');
                        try {
                            await refreshYoutubeAccessToken(); // Refresh token
                            accessToken = await get_YoutubeAccessToken(); // Get new access token after refresh
                        } catch (refreshError) {
                            console.error('Failed to refresh access token:', refreshError.message);
                            break; // Stop retrying if token refresh fails
                        }
                    } else if (status === 403 && data.error && data.error.errors[0].reason === 'quotaExceeded') { // Quota Exceeded
                        console.error('Quota exceeded. Please check your quota usage or request an increase.');
                        break; // Stop retrying on quota limit
                    } else {
                        console.error(`Error searching for track ${track.trackName}:`, error.message);
                        break; // Other errors, stop retrying
                    }
                } else {
                    console.error(`Error searching for track ${track.trackName}:`, error.message);
                    break; // Stop retrying on network or other errors
                }
            }
        }

        // Return empty result if retries fail
        return {
            trackName: track.trackName,
            results: []
        };
    };

    // Perform searches concurrently using Promise.allSettled for better performance
    const results = await Promise.allSettled(tracks.map((track) => performSearch(track)));

    // Collect search results and handle errors
    const searchResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return result.value; // Return the search result
        } else {
            console.error(`Error searching for track ${tracks[index].trackName}:`, result.reason);
            return { trackName: tracks[index].trackName, results: [] }; // Return empty result on error
        }
    });

    // Return search results
    return searchResults;
};
