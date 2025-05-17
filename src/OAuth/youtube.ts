import prisma from '../db/index';
import axios from 'axios';
import querystring from 'querystring';
import redis from '../config/redis';

const client_id = process.env.YOUTUBE_CLIENT_ID;
const client_secret = process.env.YOUTUBE_CLIENT_SECRET;
const redirect_uri = process.env.YOUTUBE_REDIRECT_URI;

export const handleYouTubeLogin = async (req, res) => {

    // Scopes needed for managing liked videos, searching, and interacting with YouTube data
    const scope = [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/youtube',
        "https://www.googleapis.com/auth/userinfo.email",
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/youtube.readonly'
    ].join(' ');

    // Construct the Google OAuth2 URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify({
        response_type: 'code',
        client_id,
        scope,
        redirect_uri,
        access_type: 'offline',
        prompt: 'consent' // 🔹 Ensures Google always returns a refresh token
    })}`;

    // Redirect user to the Google OAuth2 login page
    res.redirect(authUrl);
};

export const handleYouTubeCallback = async (req, res) => {
    const code = req.query.code || null;
    const userId = req.session.id;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code missing.' });
    }

    try {
        console.log("Received Auth Code:", code);
        console.log("Using Redirect URI:", redirect_uri);

        // Exchange authorization code for access token
        const response = await axios.post(
            'https://oauth2.googleapis.com/token',
            querystring.stringify({
                code,
                client_id,
                client_secret,
                redirect_uri,
                grant_type: 'authorization_code'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const { access_token, refresh_token } = response.data;
        console.log("*******************")
        console.log(refresh_token)

        if (!refresh_token) {
            console.log("⚠️ No refresh_token received. This may be due to prior authorization.");
        }

        // Fetch user profile data from Google
        const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const { name, picture, email } = profileResponse.data;

        // 🔍 Check if user already exists in the database
        let user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
           console.log("User not found, redirecting to login page");
           res.redirect('/');
           return;
        } else {
            console.log("✅ Existing user:", user.id, user.email);
        }

        // 🔍 Check if the user already has YouTube data stored
        const existingYouTubeData = await prisma.youTubeData.findFirst({
            where: { userId: user.id }
        });

        if (existingYouTubeData) {
            console.log("🔄 Updating existing YouTube tokens...");
            await prisma.youTubeData.update({
                where: { id: existingYouTubeData.id },
                data: {
                    access_token: access_token,
                    refresh_token: refresh_token || existingYouTubeData.refresh_token, // Preserve existing refresh token if missing
                    last_SyncedAt: new Date(),
                }
            });
        } else {
            console.log("🆕 No existing YouTube data, creating new entry...");
            await prisma.youTubeData.create({
                data: {
                    userId: user.id,
                    username: name,
                    picture: picture,
                    access_token: access_token,
                    refresh_token: refresh_token || null,
                    createdAt: new Date()
                }
            });
        }

        console.log("✅ YouTube data stored for:", user.id);

        res.json({ message: 'YouTube login successful', userId: user.id, access_token, refresh_token });

    } catch (error) {
        console.error("YouTube OAuth Error:", error.response?.data || error.message);
        res.status(400).json({
            error: 'YouTube authentication failed.',
            details: error.response?.data || error.message
        });
    }
};
