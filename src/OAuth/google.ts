import prisma from './prismaClient';
import axios from 'axios';
import querystring from 'querystring';
import dotenv from 'dotenv';

dotenv.config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

export const handleGoogleLogin = (req, res) => {
  const scope = ['profile', 'email'].join(' ');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify({
    client_id,
    redirect_uri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent'
  })}`;
  return res.redirect(authUrl);
};

export const handleGoogleCallback = async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing.' });
  }

  try {
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      querystring.stringify({
        code,
        client_id,
        client_secret,
        redirect_uri,
        grant_type: 'authorization_code'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { name, picture, email } = profileResponse.data;

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          username: name,
          profilePicture: picture,
          access_token,
          refresh_token: refresh_token || null,
          keepInSync: true,
          primaryService: null,
          lastSyncTime: null,
          lastSyncTracks: null,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { email },
        data: { access_token }
      });
    }

    return res.json({ message: 'Google login successful', userId: user.id, access_token, refresh_token });
  } catch (error) {
    return res.status(400).json({
      error: 'Google authentication failed.',
      details: error.response?.data || error.message
    });
  }
};
