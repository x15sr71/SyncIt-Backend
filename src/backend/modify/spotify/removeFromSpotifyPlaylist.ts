import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';

const MAX_RETRIES = 3; // Maximum retries for failed requests
const RATE_LIMIT_RETRY_DELAY = 1000; // 1 second delay between requests to avoid rate limiting

// Generic function to remove tracks from a playlist
const removeFromPlaylist = async (playlistId, trackIds, accessToken) => {
    const BATCH_SIZE = 50; // Limit of 50 tracks per batch

    for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
        const batch = trackIds.slice(i, i + BATCH_SIZE);

        console.log(`Removing batch of ${batch.length} tracks from playlist ${playlistId}...`);
        try {
            const response = await axios.delete(
                `https://api.spotify.com/v1/${playlistId === 'me' ? 'me/tracks' : `playlists/${playlistId}/tracks`}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    data: playlistId === 'me' 
                        ? { ids: batch } // For "liked tracks"
                        : { tracks: batch.map(id => ({ uri: `spotify:track:${id}` })) }, // For specific playlists
                }
            );

            if (response.status === 200) {
                console.log(`Successfully removed ${batch.length} tracks.`);
            } else {
                console.error(`Failed to remove tracks. Status code: ${response.status}`);
            }
        } catch (error) {
            console.error(
                `Error removing tracks from playlist: ${error.response?.data || error.message}`
            );
            throw error;
        }
    }
};

// Fetch tracks from a playlist with pagination
const fetchPlaylistTracks = async (playlistId, accessToken, tracks = [], nextUrl = null) => {
    const url = nextUrl || 
        (playlistId === 'me' 
            ? 'https://api.spotify.com/v1/me/tracks' 
            : `https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
    try {
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        tracks.push(...(response.data.items || []));
        if (response.data.next) {
            return fetchPlaylistTracks(playlistId, accessToken, tracks, response.data.next);
        }
        return tracks;
    } catch (error) {
        throw new Error(`Failed to fetch tracks: ${error.message}`);
    }
};

// Main function to empty a playlist
export const emptyLikedTracks = async (playlistId = 'me') => {
    let accessToken = await get_SpotifyAccessToken();

    try {
        console.log(`Fetching tracks from playlist: ${playlistId === 'me' ? 'Liked Songs' : playlistId}`);
        const tracks = await fetchPlaylistTracks(playlistId, accessToken);

        if (tracks.length === 0) {
            console.log('No tracks found in the playlist.');
            return;
        }

        const trackIds = tracks.map(item => item.track.id);
        console.log(`Found ${trackIds.length} tracks. Removing them now...`);

        await removeFromPlaylist(playlistId, trackIds, accessToken);
        console.log('Successfully emptied the playlist.');
    } catch (error) {
        console.error(`Error emptying the playlist: ${error.message}`);
    }
};

export default emptyLikedTracks;
