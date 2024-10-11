import axios from 'axios';
import prisma from '../../db';
import querystring from 'querystring';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

export async function get_SpotifyAccessToken() {
    try {
        const access_token = await prisma.spotifyData.findMany({
            where: {
                username: "Chandragupt Singh"
            },
            select: {
                access_token: true
            }
        });

        if (access_token.length === 0 || !access_token[0].access_token) {
            throw new Error("Access token not found or invalid");
        }

        return access_token[0].access_token;

    } catch (error) {
        console.error("Error in Spotify fetching access_token:", error.message);
        return null; 
    }
}

export const refreshSpotifyToken = async () => {
    try {
        const spotifyData = await prisma.spotifyData.findFirst({
            where: {
                username: "Chandragupt Singh"
            },
            select: {
                id: true,
                refresh_token: true
            }
        });

        if (!spotifyData) {
            throw new Error("Spotify data not found in the database");
        }

        const { id, refresh_token } = spotifyData;

        if (!refresh_token) {
            throw new Error("Refresh token not found");
        }

        const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`;

        const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader
            }
        });

        const { access_token, refresh_token: newRefreshToken } = response.data;

        await prisma.spotifyData.update({
            where: { 
                id: id
            },
            data: {
                access_token: access_token,
                refresh_token: newRefreshToken || refresh_token
            }
        });

        return access_token;

    } catch (error) {
        console.error('Error refreshing token:', error.message);
        return null; 
    }
};
