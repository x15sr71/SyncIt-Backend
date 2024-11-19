import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';

const MAX_RETRIES = 3; // Maximum retries for failed requests
const SPOTIFY_API_URL = 'https://api.spotify.com/v1/me/tracks'; // User's liked tracks endpoint
const RATE_LIMIT_RETRY_DELAY = 1000; // 1 second delay between requests to avoid rate limiting

// Handle errors, refresh token if necessary, and retry if applicable
const handlePlaylistError = async (error, retryCount) => {
    const { response } = error;

    if (!response) {
        console.error('Network error:', error.message);
        return null;
    }

    const { status, data } = response;
    if (status === 401) {
        console.warn('Access token expired. Attempting to refresh...');
        try {
            // Refresh the token only once and retry the request
            if (retryCount < MAX_RETRIES) {
                await refreshSpotifyToken();
                const newToken = await get_SpotifyAccessToken();
                return newToken;
            }
        } catch (refreshError) {
            console.error('Failed to refresh token:', refreshError.message);
        }
    } else if (status === 403 && data?.error?.message === 'quotaExceeded') {
        console.error('Quota exceeded. Check your quota or request an increase.');
    } else if (status === 429) { // Rate limit exceeded
        console.warn('Rate limit exceeded. Retrying after delay...');
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY)); // Delay before retrying
        return true; // Retry the same request
    } else {
        console.error(`Error: ${data?.error?.message || error.message}`);
    }
    return null;
};

// Fetch liked tracks with pagination
const fetchLikedTracks = async (accessToken, tracks = [], nextUrl = null) => {
    try {
        const url = nextUrl || SPOTIFY_API_URL;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        tracks.push(...response.data.items); // Collect the tracks
        if (response.data.next) {
            return fetchLikedTracks(accessToken, tracks, response.data.next); // Recursive pagination
        }

        return tracks;
    } catch (error) {
        throw new Error(`Failed to fetch liked tracks: ${error.message}`);
    }
};

// Remove tracks from liked tracks in batches of 100
const removeTracksFromLiked = async (tracks, accessToken, retryCount = 0) => {
    const trackIds = tracks.map(item => item.track.id); // Extract track IDs
    const BATCH_SIZE = 50; // Limit of 100 tracks per request

    // Ensure that we do not exceed the limit of 100 track IDs per request
    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
        const batch = trackIds.slice(i, i + BATCH_SIZE); // Get batch of 100 or less

        console.log(`Preparing to remove batch of ${batch.length} tracks...`);
        console.log(`Track IDs for this batch:`, batch); // Log the track IDs to verify

        try {
            const response = await axios.delete(SPOTIFY_API_URL, {
                headers: { Authorization: `Bearer ${accessToken}` },
                data: { ids: batch },  // Send track IDs in the 'ids' field
            });

            if (response.status === 200) {
                console.log(`Successfully removed ${batch.length} tracks.`);
            } else {
                console.error(`Failed to remove batch of tracks. Status code: ${response.status}`);
            }
        } catch (error) {
            const newToken = await handlePlaylistError(error, retryCount);
            if (newToken) {
                // Retry the operation with the new token or after rate-limiting delay
                await removeTracksFromLiked(tracks, newToken === true ? accessToken : newToken, retryCount + 1);
                return; // Exit after successful retry
            }
            throw new Error(`Failed to remove tracks: ${error.message}`);
        }
    }
};

// Main function to empty the liked tracks
export const emptyLikedTracks = async () => {
    let accessToken = await get_SpotifyAccessToken(); // Fetch initial access token

    try {
        console.log('Fetching liked tracks...');
        const tracks = await fetchLikedTracks(accessToken);

        if (tracks.length === 0) {
            console.log('No tracks found in the liked tracks.');
            return;
        }

        console.log(`Found ${tracks.length} tracks in the liked tracks.`);
        console.log(`Removing ${tracks.length} tracks from liked tracks...`);
        await removeTracksFromLiked(tracks, accessToken);
        console.log('Successfully emptied liked tracks.');
    } catch (error) {
        console.error(`Error emptying liked tracks: ${error.message}`);
    }
};

export default emptyLikedTracks;
