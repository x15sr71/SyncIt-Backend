import prisma from "../../db";
import axios from "axios";
import { refreshSpotifyToken, get_SpotifyAccessToken } from "../../OAuth/tokenManagement/spotifyTokenUtil";

type CreatePlaylistArgs = {
    playlistName: string;
    spotify_UserId: string; // Corrected property name
    description?: string;  
    isPublic?: boolean;   
};

type SpotifyPlaylist = {
    id: string;
    name: string;
    href: string;
    description: string;
};

export default async function createSpotifyPlaylistHandler(req, res) {
    try {
        console.log(req.headers);

        const playlistDataHeader = req.headers?.playlistdata;
        if (!playlistDataHeader) {
            return res.status(400).json({ error: "Missing playlistData header" });
        }

        const playlistData = JSON.parse(playlistDataHeader);
        const { playlistName, description, isPublic } = playlistData;  

        const userId = req.session.id;
        console.log(userId)

        // Retrieve the Spotify user ID
        const spotifyUser = await prisma.spotifyData.findFirst({
            where: {
                userId: userId
            },
            select: {
                spotify_user_id: true
            }
        });
        console.log(spotifyUser)
        if (!spotifyUser?.spotify_user_id) {
            return res.status(400).json({ error: "Spotify account not linked" });
        }

        console.log(`Spotify User ID: ${spotifyUser.spotify_user_id}`);

        const playlist = await createSpotifyPlaylist({
            playlistName,
            spotify_UserId: spotifyUser.spotify_user_id, 
            description,
            isPublic
        });

        res.status(200).json(playlist);
    } catch (error) {
        console.error("Error in createSpotifyPlaylistHandler:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function createSpotifyPlaylist({
    playlistName,
    spotify_UserId,  // Use the correct property
    description,
    isPublic                          
}: CreatePlaylistArgs): Promise<SpotifyPlaylist> {
    
    let accessToken: string = await get_SpotifyAccessToken();
    
    const url = `https://api.spotify.com/v1/users/${spotify_UserId}/playlists`; // Use Spotify ID here
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
