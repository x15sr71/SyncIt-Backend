import axios from 'axios';
import prisma from '../../db/prisma';
import querystring from 'querystring';
import { encryptToken, decryptToken } from '../../backend/utility/tokenCrypto';
import { acquireRefreshLock, releaseRefreshLock, waitForRefreshLock } from '../refreshLock';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const REQUEST_TIMEOUT = 10000;
const EXPIRY_BUFFER_MS = 60_000; // refresh if token expires within 60 s

export async function get_SpotifyAccessToken(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  const spotifyData = await prisma.spotifyData.findFirst({
    where: { userId },
    select: { access_token: true, token_expires_at: true, needs_reconnect: true },
  });

  if (!spotifyData) {
    throw new Error('Spotify account not connected for this user');
  }
  if (spotifyData.needs_reconnect) {
    throw new Error(
      'SPOTIFY_NEEDS_RECONNECT: refresh token was revoked — please reconnect your Spotify account',
    );
  }
  if (!spotifyData.access_token) {
    throw new Error('Spotify access token missing — please reconnect your Spotify account');
  }

  // Proactive expiry check: refresh before the token actually expires
  if (
    spotifyData.token_expires_at &&
    spotifyData.token_expires_at.getTime() - Date.now() < EXPIRY_BUFFER_MS
  ) {
    const refreshed = await refreshSpotifyToken(userId);
    if (!refreshed?.access_token) {
      throw new Error('Failed to proactively refresh Spotify token');
    }
    return refreshed.access_token;
  }

  return decryptToken(spotifyData.access_token);
}

export const refreshSpotifyToken = async (userId: string) => {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  if (!client_id || !client_secret) {
    throw new Error('Missing Spotify credentials in environment');
  }

  // Serialize concurrent refreshes per user: with token rotation, parallel
  // refreshes race and a losing writer persists a dead refresh token (P1-5).
  const acquired = await acquireRefreshLock('spotify', userId);
  if (!acquired) {
    await waitForRefreshLock('spotify', userId);
    const row = await prisma.spotifyData.findFirst({
      where: { userId },
      select: { access_token: true, token_expires_at: true },
    });
    if (
      row?.access_token &&
      row.token_expires_at &&
      row.token_expires_at.getTime() - Date.now() > EXPIRY_BUFFER_MS
    ) {
      // The concurrent refresher finished — reuse its token.
      return { access_token: decryptToken(row.access_token) };
    }
    return null;
  }

  try {
    const spotifyData = await prisma.spotifyData.findFirst({
      where: { userId },
      select: { id: true, refresh_token: true },
    });

    if (!spotifyData) {
      throw new Error('Spotify data not found in the database');
    }

    if (!spotifyData.refresh_token) {
      throw new Error('Refresh token not found');
    }
    const refresh_token = decryptToken(spotifyData.refresh_token);

    const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`;

    // The HTTP call happens OUTSIDE any Prisma transaction: inside one, a
    // slow token endpoint aborted the 5s interactive transaction and pinned
    // a pooled connection for the duration (P1-5).
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: authHeader,
        },
        timeout: REQUEST_TIMEOUT,
      },
    );

    if (!response.data?.access_token) {
      throw new Error('Invalid response from Spotify token endpoint');
    }

    const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;
    const token_expires_at = new Date(Date.now() + (expires_in ?? 3600) * 1000);

    await prisma.spotifyData.update({
      where: { id: spotifyData.id },
      data: {
        access_token: encryptToken(access_token),
        refresh_token: encryptToken(newRefreshToken || refresh_token),
        token_expires_at,
        needs_reconnect: false,
      },
    });

    return { access_token };
  } catch (error: any) {
    console.error('Error refreshing Spotify token:', error.message);

    if (error.response) {
      const { status, data } = error.response;
      console.error(`Spotify token refresh failed with status ${status}:`, data);

      if (status === 400 && data?.error === 'invalid_grant') {
        // Flag the account so the client can surface "Reconnect" instead of
        // looping on 401s (P1-5).
        await prisma.spotifyData
          .updateMany({ where: { userId }, data: { needs_reconnect: true } })
          .catch(() => {});
        throw new Error('Refresh token is invalid or expired. User needs to re-authenticate.');
      }
    }

    return null;
  } finally {
    await releaseRefreshLock('spotify', userId);
  }
};
