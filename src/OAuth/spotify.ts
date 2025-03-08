import prisma from '../db/index';
import axios from 'axios';
import querystring from 'querystring';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

export const handleSpotifyLogin = (req, res) => {
  const scope =
    'user-library-modify user-read-email user-read-private user-library-read playlist-read-private playlist-modify-private playlist-modify-public playlist-read-collaborative user-top-read user-read-recently-played';
  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id,
    scope,
    redirect_uri,
    prompt: 'consent'
  })}`;
  return res.redirect(authUrl);
};

export const handleSpotifyCallback = async (req, res) => {
  const code = req.query.code || null;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing.' });
  }

  const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`;

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: authHeader,
        },
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    // Fetch user's Spotify profile information using the access token
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { display_name, email, images } = profileResponse.data;
    const profile_picture = images && images.length ? images[0].url : '';

    // Check if user already exists in the database
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log("User not found, redirecting to signup page");
      return res.redirect('/google/login');
    }

    // Check if the user already has Spotify data stored
    const existingSpotifyData = await prisma.spotifyData.findFirst({
      where: { userId: user.id },
    });
    console.log("existing user log:", existingSpotifyData)

    if (existingSpotifyData) {
      await prisma.spotifyData.update({
        where: { id: existingSpotifyData.id },
        data: {
          username: display_name,
          picture: profile_picture,
          access_token: access_token,
        },
      });
      console.log("Spotify data updated for user:");
    } else {
      await prisma.spotifyData.create({
        data: {
          userId: user.id,
          username: display_name,
          picture: profile_picture,
          access_token: access_token,
          refresh_token: refresh_token,
          createdAt: new Date(),
        },
      });
      console.log("Spotify data created for user:", user.id, user.email);
    }

    return res.json({ message: 'Spotify login successful', userId: user.id, access_token, refresh_token });
  } catch (error) {
    console.error('Spotify OAuth Error:', error.response ? error.response.data : error.message);
    return res.status(400).json({
      error: 'Spotify authentication failed.',
      details: error.response ? error.response.data : error.message,
    });
  }
};
