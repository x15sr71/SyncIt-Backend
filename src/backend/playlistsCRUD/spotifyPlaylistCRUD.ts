import axios, { AxiosResponse } from "axios";
import { get_SpotifyAccessToken } from "../../OAuth/tokenManagement/spotifyTokenUtil";

// Define Spotify API response types
interface Playlist {
    id: string;
    name: string;
    description: string;
    tracks: {
        total: number;
    };
}

interface UserProfile {
    id: string;
    display_name: string;
}

interface PlaylistsResponse {
    items: Playlist[];
    total: number;
    limit: number;
    offset: number;
}

interface PlaylistItem {
    track: {
        id: string;
        name: string;
        artists: { name: string }[];
        album: { name: string; release_date: string };
    };
}

interface PlaylistItemsResponse {
    items: PlaylistItem[];
    total: number;
    limit: number;
    offset: number;
}

// Function to get Spotify playlists
async function get_SpotifyPlaylists(): Promise<void> {
    const access_Token = await get_SpotifyAccessToken();

    try {
        const response: AxiosResponse<PlaylistsResponse> = await axios.get(
            'https://api.spotify.com/v1/me/playlists',
            {
                headers: {
                    Authorization: `Bearer ${access_Token}`,
                },
                params: {
                    limit: 20,
                },
            }
        );
        console.log(response.data);
    } catch (error: any) {
        console.log('Error while fetching Spotify Playlists:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to create a Spotify playlist
async function create_SpotifyPlaylist(): Promise<void> {
    const access_Token = await get_SpotifyAccessToken();

    try {
        const response: AxiosResponse<UserProfile> = await axios.get(
            'https://api.spotify.com/v1/me',
            {
                headers: {
                    Authorization: `Bearer ${access_Token}`,
                },
            }
        );
        const userID = response.data.id;
        console.log('User ID:', userID);
    } catch (error: any) {
        console.log('Error while getting userID:', error.response ? error.response.data : error.message);
        throw error;
    }

    // Assuming playlist creation logic will be added here

    try {
        const response: AxiosResponse<PlaylistsResponse> = await axios.get(
            'https://api.spotify.com/v1/me/playlists',
            {
                headers: {
                    Authorization: `Bearer ${access_Token}`,
                },
                params: {
                    limit: 20,
                },
            }
        );
        console.log(response.data);
    } catch (error: any) {
        console.log('Error while fetching Spotify Playlists:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Function to get items from a Spotify playlist
async function get_SpotifyPlaylistItems(playlistId: string): Promise<void> {
    const access_Token = await get_SpotifyAccessToken();

    try {
        const response: AxiosResponse<PlaylistItemsResponse> = await axios.get(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
                headers: {
                    Authorization: `Bearer ${access_Token}`,
                    "Content-Type": 'application/json',
                },
            }
        );
        console.log(response.data);
    } catch (error: any) {
        console.log('Error while fetching playlist items', error.response ? error.response.data : error.message);
        throw error;
    }
}
