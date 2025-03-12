import prisma from "../../db";
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
    try {
        console.log(req.headers);

        const playlistDataHeader = req.headers?.playlistdata; // Ensure lowercase
        if (!playlistDataHeader) {
            return res.status(400).json({ error: "Missing playlistData header" });
        }

        const playlistData = JSON.parse(playlistDataHeader); // Parse JSON
        const { playlistName, description, isPublic } = playlistData;  

        //console.log(playlistName, description, isPublic);
        
        const userId = req.session.id
        const spotifyUserId = await prisma.spotifyData.findFirst({
            where: {
                userId: userId
            },
            select: {
                id: true
            }
        })
        console.log(spotifyUserId)

        createSpotifyPlaylist({playlistName, userId, description, isPublic})

    } catch (error) {
        console.error("Error in createSpotifyPlaylistHandler:", error);
        res.status(400).json({ error: "Invalid playlistData format" });
    }
}

async function createSpotifyPlaylist({
    playlistName,
    userId,
    description,
    isPublic                          
}: CreatePlaylistArgs): Promise<SpotifyPlaylist> {
    
    let accessToken: string = await get_SpotifyAccessToken()
    
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
