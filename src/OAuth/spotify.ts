import prisma from './prismaClient';
import axios from 'axios';
import querystring from 'querystring';
import dotenv from 'dotenv';

dotenv.config();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

export const handleSpotifyLogin = (req, res) => {
    const scope = 'user-library-modify user-library-read playlist-read-private playlist-modify-private playlist-modify-public playlist-read-collaborative user-top-read user-read-recently-played';
    const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
        response_type: 'code',
        client_id,
        scope,
        redirect_uri,
        prompt: 'consent'
    })}`;

    res.redirect(authUrl);
};

export const handleSpotifyCallback = async (req, res) => {
    const code = req.query.code || null;

    const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`;

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri,
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader
            }
        });

        // Log the full response data
        console.log('Spotify API Response:', response.data);
        
        const { access_token, refresh_token } = response.data;
        console.log(access_token)

        await prisma.spotifyData.create({
            data: {
                username: 'Moli',
                access_token: access_token,
                refresh_token: refresh_token
            }
        })
        console.log("added to db")

        res.json({ access_token, refresh_token });
    } catch (error) {
        console.error('Error response from Spotify API:', error.response ? error.response.data : error.message);
        res.status(400).json({
            error: 'Spotify authentication failed.',
            details: error.response ? error.response.data : error.message
        });
    }
};

