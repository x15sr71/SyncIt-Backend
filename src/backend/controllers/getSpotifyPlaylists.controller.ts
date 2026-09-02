import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../auth/spotify/spotifyTokenUtil';

const SPOTIFY_PLAYLISTS_API = 'https://api.spotify.com/v1/me/playlists';
const MAX_RETRIES = 2;

export const getPlaylistsHandler = async (req: Request, res: Response) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'User session not found. Please log in.',
    });
  }

  let retryCount = 0;
  let accessToken: string | null = null;

  // get_SpotifyAccessToken THROWS when the account is not connected or the
  // refresh token was revoked — it never resolves to null. Without this catch
  // the rejection escapes the async handler (Express 4 does not trap those)
  // and the unhandledRejection hook shuts the whole process down, so one user
  // opening the dashboard before connecting Spotify took the server offline.
  try {
    accessToken = await get_SpotifyAccessToken(userId);
  } catch (error: any) {
    const needsReconnect = String(error?.message ?? '').includes('SPOTIFY_NEEDS_RECONNECT');
    console.error('Failed to get Spotify access token:', error);
    return res.status(401).json({
      success: false,
      error: needsReconnect ? 'SPOTIFY_NEEDS_RECONNECT' : 'SPOTIFY_NOT_CONNECTED',
      message: needsReconnect
        ? 'Your Spotify connection expired. Please reconnect your account.'
        : 'Spotify account not connected. Please connect Spotify to continue.',
    });
  }

  // If there's no access token in DB, we cannot even attempt an API call (nor a refresh)
  if (!accessToken) {
    return res.status(401).json({
      success: false,
      error: 'SPOTIFY_TOKEN_NOT_FOUND',
      message: 'Spotify access token not found. Please log in again.',
    });
  }

  while (retryCount <= MAX_RETRIES) {
    try {
      // Paginate fully — one page meant users with >50 playlists saw a
      // truncated dashboard (P2-2).
      const playlists: any[] = [];
      let offset = 0;
      let total = 1;
      while (offset < total) {
        const response = await axios.get(SPOTIFY_PLAYLISTS_API, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            limit: 50,
            offset,
          },
        });
        total = response.data.total ?? 0;
        playlists.push(...(response.data.items ?? []));
        offset += 50;
      }

      return res.json({ success: true, data: playlists });
    } catch (error: any) {
      const status = error?.response?.status;

      // Only try to refresh IF there was a valid access token, and it's expired (401)
      if (status === 401 && retryCount < MAX_RETRIES) {
        console.log('Access token expired. Attempting to refresh...');
        const refreshed = await refreshSpotifyToken(userId);

        if (refreshed?.access_token) {
          accessToken = refreshed.access_token;
          retryCount++;
          continue;
        } else {
          return res.status(401).json({
            success: false,
            error: 'AUTH_REFRESH_FAILED',
            message: 'Failed to refresh token. Please log in again.',
          });
        }
      }

      console.error('Spotify API error:', error?.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: 'SPOTIFY_API_ERROR',
        message: 'Failed to fetch playlists from Spotify.',
      });
    }
  }
};
