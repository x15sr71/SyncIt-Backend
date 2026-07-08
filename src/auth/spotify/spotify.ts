import { Request, Response, NextFunction } from 'express';
import prisma from '../../db/prisma';
import axios from 'axios';
import querystring from 'querystring';
import { generateOAuthState, validateOAuthState, buildRedirectUrl } from '../oauthState';
import { encryptToken } from '../../backend/utility/tokenCrypto';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

export const handleSpotifyLogin = async (req: Request, res: Response) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      error: 'AUTH_ERROR',
      message: 'User session not found. Please log in first.',
    });
  }

  // Honor redirect_after like the Google/YouTube flows do, so pages like
  // /connect and /sync can round-trip the user back to themselves.
  const redirectAfter = (req.query.redirect_after as string) || '/dashboard';

  const state = await generateOAuthState('spotify_connect', {
    userId,
    sessionId: req.cookies?.sessionId,
    redirectAfter,
  });

  const scope =
    'user-library-modify user-read-email user-read-private user-library-read playlist-read-private playlist-modify-private playlist-modify-public playlist-read-collaborative user-top-read user-read-recently-played';

  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
    response_type: 'code',
    client_id,
    scope,
    redirect_uri,
    show_dialog: true,
    state,
  })}`;

  return res.redirect(authUrl);
};

export const handleSpotifyCallback = async (req: Request, res: Response) => {
  const code = (req.query.code as string) || null;
  const stateParam = req.query.state as string | undefined;

  // Validate state before doing anything else (CSRF protection)
  const stateData = await validateOAuthState(stateParam);
  if (!stateData) {
    return res.status(400).json({
      error: 'Invalid or missing OAuth state. Possible CSRF attempt.',
    });
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing.' });
  }

  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      error: 'AUTH_ERROR',
      message: 'User session not found. Please log in again.',
    });
  }

  // Verify the state's userId matches the current session user
  if (stateData.userId && stateData.userId !== userId) {
    return res.status(403).json({
      error: 'AUTH_ERROR',
      message: 'Session user does not match OAuth state. Possible account mismatch.',
    });
  }

  // Session binding: verify the browser that started the flow is completing it
  if (stateData.sessionId && stateData.sessionId !== req.cookies?.sessionId) {
    return res.status(403).json({
      error: 'Session mismatch - possible CSRF attempt',
    });
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
      },
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const token_expires_at = new Date(Date.now() + (expires_in ?? 3600) * 1000);

    // Fetch user's Spotify profile
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, display_name, images } = profileResponse.data;
    const profile_picture = images && images.length ? images[0].url : '';

    const existingSpotifyData = await prisma.spotifyData.findFirst({
      where: { userId },
      select: { id: true, refresh_token: true },
    });

    if (existingSpotifyData) {
      await prisma.spotifyData.update({
        where: { id: existingSpotifyData.id },
        data: {
          spotify_user_id: id,
          username: display_name,
          picture: profile_picture,
          access_token: encryptToken(access_token),
          refresh_token: refresh_token
            ? encryptToken(refresh_token)
            : existingSpotifyData.refresh_token,
          token_expires_at,
          needs_reconnect: false,
        },
      });
    } else {
      await prisma.spotifyData.create({
        data: {
          userId,
          spotify_user_id: id,
          username: display_name,
          picture: profile_picture,
          access_token: encryptToken(access_token),
          refresh_token: encryptToken(refresh_token),
          token_expires_at,
          createdAt: new Date(),
        },
      });
    }

    res.redirect(buildRedirectUrl(stateData.redirectAfter));
  } catch (error: any) {
    console.error('Spotify OAuth Error:', error.response ? error.response.data : error.message);
    return res.status(400).json({
      error: 'Spotify authentication failed.',
      details: error.response ? error.response.data : error.message,
    });
  }
};
