import prisma from './prismaClient';
import axios from 'axios';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uri);

// Route to initiate Google OAuth2.0 login

export const handleGoogleLogin = async (req, res) => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['profile', 'email'],
    });
    res.redirect(authUrl);
}

// Google OAuth2.0 callback route

export const handleGoogleCallback = async (req, res) => {
    console.log(req.body)
    const code = req.query.code;

    try {
        // Get the token using the authorization code
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Get user info from Google
        const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
            },
        });

        const googleEmail = response.data.email;
        const googleUsername = response.data.name;
        const googleProfilePicture = response.data.picture;

        // console.log(`Username: ${googleUsername}
        //     , gmailId: ${googleEmail}, Image: ${googleProfilePicture}`)

        //Find or create the user in your database
        let user = await prisma.user.findUnique({
            where: { email: googleEmail },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: googleEmail,
                    username: googleUsername,
                    profilePicture: googleProfilePicture, // or some default image URL
                    //token: tokens.access_token, // or some default token
                },
            });

            // spotify = await prisma.spotifyToken.create({
            //     data: {
            //     }
            // })
            
            console.log("User Created")
        }

        res.json({ message: 'Google OAuth successful!' });
        
    } catch (error) {
        console.error('Error during Google OAuth:', error.message);
        res.status(400).json({ error: 'Google authentication failed.' });
    }
}
