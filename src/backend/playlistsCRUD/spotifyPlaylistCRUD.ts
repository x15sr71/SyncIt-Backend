import axios from "axios";
import { get_SpotifyAccessToken } from "../../OAuth/tokenManagement/spotifyTokenUtil";

async function get_SpotifyPlaylists() {
    const access_Token = await get_SpotifyAccessToken();

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
            headers: {
                Authorization: `Bearer ${access_Token}`
            },
            params: {
                limit: 20
            }
        });
    } catch (error) {
        console.log('Error while fetching Spotify Playlists:', error.response ? error.response.data : error.message);
        throw error; 
    }
}

async function create_SpotifyPlaylist() {
    const access_Token = await get_SpotifyAccessToken();

    try {
        const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${access_Token}`
            }
        });
        const userID = response.data.id;
        console.log('User ID:', userID);
    } catch (error) {
        console.log('Error while getting userID:', error.response ? error.response.data : error.message);
        throw error; 
    }

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
            headers: {
                Authorization: `Bearer ${access_Token}`
            },
            params: {
                limit: 20,
            }
        });
    } catch (error) {
        console.log('Error while fetching Spotify Playlists:', error.response ? error.response.data : error.message);
        throw error; 
    }
}

async function get_SpotifyPlaylistItems(playlistId) {
    
    const access_Token = await get_SpotifyAccessToken()

    try{
        const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: {
                Authorization: `Bearer ${access_Token}`,
                "Content-Type": 'application/json'
            }
        })
    } catch(error) {
        console.log('Error while fetching playlist items', error.response ? error.response.data : error.message)
        throw(error)
    }

}
