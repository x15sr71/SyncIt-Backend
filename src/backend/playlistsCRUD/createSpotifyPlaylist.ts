import axios from "axios";
import { refreshSpotifyToken, get_SpotifyAccessToken } from "../../OAuth/tokenManagement/spotifyTokenUtil";

type CreatePlaylistArgs = {
    playlistName: string;
    userId: string;
    description?: string;  
    isPublic?: boolean;   
};

type SpotifyPlaylist = {
    id: string,
    name: string,
    href: string,
    description: string
}

export default async function createSpotifyPlaylistHandler(req, res) {
    const { playlistName, description, isPublic } = req.headers?.playlistData;
    const userId = req.sessionData.id;   
    console.log(userId, playlistName, description, isPublic) 
}

async function createSpotifyPlaylist({
    playlistName,
    userId,
    description = 'Playlist created via API', 
    isPublic                          
}: CreatePlaylistArgs): Promise<SpotifyPlaylist> {
    
    let accessToken: string = await get_SpotifyAccessToken();
    
    const url = `https://api.spotify.com/v1/users/${userId}/playlists`;

    const data = {
        name: playlistName,
        public: isPublic,
        description: description
    };

    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.post(url, data, { headers });
        console.log(`Playlist "${playlistName}" created successfully!`);
        return response.data as SpotifyPlaylist;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Access token expired. Refreshing token...');
            try {
                accessToken = await refreshSpotifyToken();
                headers.Authorization = `Bearer ${accessToken}`;
                const retryResponse = await axios.post(url, data, { headers });
                console.log(`Playlist "${playlistName}" created successfully on retry!`);
                return retryResponse.data as SpotifyPlaylist;
            } catch (refreshError) {
                console.error('Failed to refresh token:', refreshError.message);
                throw refreshError;
            }
        } else {
            console.error('Error creating playlist:', error.response?.data || error.message);
            throw error;
        }
    }
}
