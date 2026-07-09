import axios from 'axios';
import prisma from '../../db/prisma';
import querystring from 'querystring';
import { encryptToken, decryptToken } from '../../backend/utility/tokenCrypto';
import { acquireRefreshLock, releaseRefreshLock, waitForRefreshLock } from '../refreshLock';

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const REQUEST_TIMEOUT = 10000;
const EXPIRY_BUFFER_MS = 60_000; // refresh if token expires within 60 s

export async function get_YoutubeAccessToken(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  const tokenData = await prisma.youTubeData.findFirst({
    where: { userId },
    select: { access_token: true, token_expires_at: true, needs_reconnect: true },
  });

  if (!tokenData) {
    throw new Error('YouTube account not connected for this user');
  }
  if (tokenData.needs_reconnect) {
    throw new Error(
      'YOUTUBE_NEEDS_RECONNECT: refresh token was revoked — please reconnect your YouTube account',
    );
  }
  if (!tokenData.access_token) {
    throw new Error('YouTube access token missing — please reconnect your YouTube account');
  }

  // Proactive expiry check: refresh before the token actually expires
  if (
    tokenData.token_expires_at &&
    tokenData.token_expires_at.getTime() - Date.now() < EXPIRY_BUFFER_MS
  ) {
    const result = await refreshYoutubeAccessToken(userId);
    if (!result.success || !result.newAccessToken) {
      throw new Error('Failed to proactively refresh YouTube token');
    }
    return result.newAccessToken;
  }

  return decryptToken(tokenData.access_token);
}

export async function refreshYoutubeAccessToken(userId: string): Promise<{
  success: boolean;
  newAccessToken?: string;
  error?: string;
}> {
  if (!userId || typeof userId !== 'string') {
    return { success: false, error: 'invalid_user_id' };
  }

  if (!client_id || !client_secret) {
    console.error('Missing Google OAuth credentials in environment');
    return { success: false, error: 'missing_credentials' };
  }

  // Serialize concurrent refreshes per user: parallel refreshes race and a
  // losing writer can persist a stale refresh token (P1-5).
  const acquired = await acquireRefreshLock('youtube', userId);
  if (!acquired) {
    await waitForRefreshLock('youtube', userId);
    const row = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { access_token: true, token_expires_at: true },
    });
    if (
      row?.access_token &&
      row.token_expires_at &&
      row.token_expires_at.getTime() - Date.now() > EXPIRY_BUFFER_MS
    ) {
      // The concurrent refresher finished — reuse its token.
      return { success: true, newAccessToken: decryptToken(row.access_token) };
    }
    return { success: false, error: 'refresh_in_progress' };
  }

  try {
    const tokenData = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { id: true, refresh_token: true },
    });

    if (!tokenData) {
      return { success: false, error: 'user_not_found' };
    }

    if (!tokenData.refresh_token) {
      return { success: false, error: 'no_refresh_token' };
    }
    const refreshToken = decryptToken(tokenData.refresh_token);

    const requestBody = querystring.stringify({
      refresh_token: refreshToken,
      client_id,
      client_secret,
      grant_type: 'refresh_token',
    });

    // The HTTP call happens OUTSIDE any Prisma transaction: inside one, a
    // slow token endpoint aborted the 5s interactive transaction and pinned
    // a pooled connection for the duration (P1-5).
    const response = await axios.post('https://oauth2.googleapis.com/token', requestBody, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: REQUEST_TIMEOUT,
    });

    if (!response.data?.access_token) {
      return { success: false, error: 'invalid_response' };
    }

    const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;
    const token_expires_at = new Date(Date.now() + (expires_in ?? 3600) * 1000);

    await prisma.youTubeData.update({
      where: { id: tokenData.id },
      data: {
        access_token: encryptToken(access_token),
        refresh_token: newRefreshToken ? encryptToken(newRefreshToken) : encryptToken(refreshToken),
        token_expires_at,
        needs_reconnect: false,
      },
    });

    return { success: true, newAccessToken: access_token };
  } catch (error: any) {
    const apiError = error.response?.data;
    console.error('Error refreshing YouTube token:', apiError || error.message);

    if (apiError?.error === 'invalid_grant') {
      // Flag the account so the client can surface "Reconnect" instead of
      // looping on 401s (P1-5). Google's Testing-mode 7-day expiry lands here.
      await prisma.youTubeData
        .updateMany({ where: { userId }, data: { needs_reconnect: true } })
        .catch(() => {});
      return { success: false, error: 'invalid_grant' };
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return { success: false, error: 'timeout' };
    }

    return { success: false, error: 'unknown_error' };
  } finally {
    await releaseRefreshLock('youtube', userId);
  }
}
