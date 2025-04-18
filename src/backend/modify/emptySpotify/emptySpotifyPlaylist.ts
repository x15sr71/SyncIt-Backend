import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';

const MAX_RETRIES = 3;
const SPOTIFY_API_URL = 'https://api.spotify.com/v1/me/tracks';
const DEFAULT_RETRY_DELAY = 1000;

// Handles token expiry, rate limiting, and other Spotify API errors
const handleSpotifyError = async (error, retryCount) => {
    const { response } = error;

    if (!response) {
        console.error('Network error:', error.message);
        return { shouldRetry: false };
    }

    const { status, data, headers } = response;

    if (status === 401 && retryCount < MAX_RETRIES) {
        console.warn('Access token expired. Refreshing...');
        try {
            await refreshSpotifyToken();
            const newToken = await get_SpotifyAccessToken();
            return { shouldRetry: true, newAccessToken: newToken };
        } catch (refreshError) {
            console.error('Token refresh failed:', refreshError.message);
        }
    } else if (status === 429) {
        const retryAfter = parseInt(headers['retry-after'] || '1', 10) * 1000;
        console.warn(`Rate limited. Retrying after ${retryAfter} ms...`);
        await new Promise(res => setTimeout(res, retryAfter || DEFAULT_RETRY_DELAY));
        return { shouldRetry: true };
    } else if (status === 403 && data?.error?.message === 'quotaExceeded') {
        console.error('Quota exceeded. Cannot proceed.');
    } else {
        console.error(`Spotify API error (${status}):`, data?.error?.message || error.message);
    }

    return { shouldRetry: false };
};

// Recursively fetch all liked tracks using pagination
const fetchLikedTracks = async (accessToken, tracks = [], nextUrl = null) => {
    try {
        const url = nextUrl || SPOTIFY_API_URL;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        tracks.push(...response.data.items);

        if (response.data.next) {
            return fetchLikedTracks(accessToken, tracks, response.data.next);
        }

        return tracks;
    } catch (error) {
        throw new Error(`Failed to fetch liked tracks: ${error.message}`);
    }
};

// Remove tracks from liked list in batches of 50, handling retries if needed
const removeTracksFromLiked = async (tracks, accessToken, retryCount = 0) => {
    const BATCH_SIZE = 50;
    const trackIds = tracks.map(item => item.track.id);

    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
        const batch = trackIds.slice(i, i + BATCH_SIZE);
        console.log(`Removing batch of ${batch.length} tracks...`);

        try {
            const response = await axios.delete(SPOTIFY_API_URL, {
                headers: { Authorization: `Bearer ${accessToken}` },
                data: { ids: batch },
            });

            if (response.status === 200) {
                console.log(`Batch of ${batch.length} tracks removed successfully.`);
            } else {
                console.warn(`Unexpected response while removing batch. Status: ${response.status}`);
            }
        } catch (error) {
            const { shouldRetry, newAccessToken } = await handleSpotifyError(error, retryCount);

            if (shouldRetry) {
                const tokenToUse = newAccessToken || accessToken;
                await removeTracksFromLiked(tracks, tokenToUse, retryCount + 1);
                return;
            }

            throw new Error(`Failed to remove tracks after retry: ${error.message}`);
        }
    }
};

// Main function to orchestrate the clearing of liked tracks
export const emptySpotifyPlaylist = async () => {
    let accessToken = await get_SpotifyAccessToken();

    try {
        console.log('Fetching liked tracks...');
        const tracks = await fetchLikedTracks(accessToken);

        if (tracks.length === 0) {
            console.log('No liked tracks found.');
            return;
        }

        console.log(`Found ${tracks.length} liked tracks. Removing...`);
        await removeTracksFromLiked(tracks, accessToken);
        console.log('Successfully removed all liked tracks.');
    } catch (error) {
        console.error('Error during playlist clearing:', error.message);
    }
};

export default emptySpotifyPlaylist;
