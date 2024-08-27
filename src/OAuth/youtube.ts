import prisma from './prismaClient';
import axios from 'axios';
import querystring from 'querystring';

const client_id = process.env.YOUTUBE_CLIENT_ID;
const client_secret = process.env.YOUTUBE_CLIENT_SECRET;
const redirect_uri = process.env.YOUTUBE_REDIRECT_URI;

export const handleYouTubeLogin = (req, res) => {
    // Scopes needed for managing liked videos, searching, and interacting with YouTube data
    const scope = [
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/youtube.readonly'
    ].join(' ');

    // Construct the Google OAuth2 URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify({
        response_type: 'code',
        client_id,
        scope,
        redirect_uri,
        access_type: 'offline'
    })}`;

    // Redirect user to the Google OAuth2 login page
    res.redirect(authUrl);
};

export const handleYouTubeCallback = async (req, res) => {
    const code = req.query.code || null;

    try {
        // Exchange the authorization code for an access token
        const response = await axios.post('https://oauth2.googleapis.com/token', querystring.stringify({
            code,
            client_id,
            client_secret,
            redirect_uri,
            grant_type: 'authorization_code'
        }));

        const { access_token, refresh_token } = response.data;

        await prisma.youTubeData.create({
            data: {
                username: 'Moli',
                access_token: access_token,
                refresh_token: refresh_token
            }
        })
        console.log("added to db")

        // Store tokens in your session, database, or wherever you plan to keep them
        // For simplicity, we're just returning them in the response here
        res.json({ access_token, refresh_token });
    } catch (error) {
        res.status(400).json({ error: 'YouTube authentication failed.' });
    }
};
