import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../../OAuth/tokenManagement/spotifyTokenUtil';
import { convertDurationToFormattedString } from '../../../../OAuth/utility/convertDuration';

const MAX_RETRIES = 3; // Maximum retries for failed requests
const SPOTIFY_API_URL = 'https://api.spotify.com/v1/search';

// Validate that the tracks array is not empty or invalid
const validateTracks = (tracks) => {
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        throw new Error('Invalid or empty tracks array');
    }
};

// Create the search query string for Spotify
const createSearchQuery = ({ title, videoChannelTitle }) => `${title} ${videoChannelTitle}`.trim();

// Handle errors, refresh token if necessary, and retry if applicable
const handleSearchError = async (error, userId) => {
    const { response } = error;

    if (!response) {
        console.error('Network error:', error.message);
        return null;
    }

    const { status, data } = response;
    if (status === 401) {
        console.warn('Access token expired. Attempting to refresh...');
        try {
            await refreshSpotifyToken(userId);
            return get_SpotifyAccessToken(userId);
        } catch (refreshError) {
            console.error('Failed to refresh token:', refreshError.message);
        }
    } else if (status === 403 && data?.error?.message === 'quotaExceeded') {
        console.error('Quota exceeded. Check your quota or request an increase.');
    } else {
        console.error(`Error: ${data?.error?.message || error.message}`);
    }
    return null;
};

// Perform the search request to Spotify
const performSearch = async (track, accessToken, userId, retryCount = 0) => {
    const searchQuery = createSearchQuery(track);

    if (!searchQuery) {
        console.warn(`Skipping invalid search query for track: ${track.title}`);
        return { title: track.title, youtubeChannelName: track.videoChannelTitle, results: [] };
    }

    try {
        const response = await axios.get(SPOTIFY_API_URL, {
            params: { q: searchQuery, type: 'track', limit: 3 },
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return { title: track.title, youtubeChannelName: track.videoChannelTitle, results: response.data.tracks.items };
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            const newToken = await handleSearchError(error, userId);
            if (newToken) {
                return performSearch(track, newToken, retryCount + 1); // Retry with a new token
            }
        }
        return { title: track.title, youtubeChannelName: track.videoChannelTitle, results: [] }; // Return empty on failure
    }
};

// Format track search results
const formatResults = (searchResults, trackNumber) => searchResults.map((track, resultIndex) => ({
    id: track.id,
    trackNumber,
    name: track.name,
    artists: track.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist',
    release_date: track.album?.release_date || 'N/A',
    duration: convertDurationToFormattedString(track.duration_ms),
    resultNumber: resultIndex + 1,
}));

// Main function to search for tracks on Spotify
export const searchTracksOnSpotify = async (tracks, globalTrackNumber, userId) => {
    validateTracks(tracks); // Ensure valid tracks array
    let accessToken = await get_SpotifyAccessToken(userId); // Fetch initial access token

    const searchPromises = tracks.map((track, index) =>
        performSearch(track, accessToken, userId).then(result => {
            const trackNumber = globalTrackNumber + index;
            return { 
                ...result, 
                trackNumber, 
                query: createSearchQuery(track), 
                results: formatResults(result.results, trackNumber)
            };
        })
    );

    const results = await Promise.allSettled(searchPromises);
    return results.map((result, index) =>
        result.status === 'fulfilled' ? result.value : { 
            title: tracks[index].title, 
            trackNumber: globalTrackNumber + index, 
            youtubeChannelName: tracks[index].videoChannelTitle, 
            query: createSearchQuery(tracks[index]), 
            results: [] 
        }
    );
};
