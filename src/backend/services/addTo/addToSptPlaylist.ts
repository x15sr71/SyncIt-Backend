import axios, { AxiosError } from 'axios';
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from '../../../auth/spotify/spotifyTokenUtil';

const MAX_AUTH_RETRIES = 2;
// Spotify caps 100 URIs per add request; larger bodies fail wholesale.
const ADD_BATCH_SIZE = 100;
const PAGE_SIZE = 50;

export interface AddToSpotifyResult {
  playlistId: string;
  /** Track IDs actually accepted by Spotify in this call. */
  addedTrackIds: string[];
  /** Track IDs skipped because the destination already contains them. */
  alreadyPresentTrackIds: string[];
  /** Track IDs whose add batch failed after retries. */
  failedTrackIds: string[];
}

/**
 * Run a Spotify call, refreshing the token and retrying on 401.
 */
async function withAuthRetry<T>(userId: string, fn: (token: string) => Promise<T>): Promise<T> {
  let token = await get_SpotifyAccessToken(userId);
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(token);
    } catch (error: any) {
      if (
        error instanceof AxiosError &&
        error.response?.status === 401 &&
        attempt < MAX_AUTH_RETRIES
      ) {
        const refreshed = await refreshSpotifyToken(userId);
        if (!refreshed?.access_token) {
          throw new Error('Spotify token refresh failed while adding tracks');
        }
        token = refreshed.access_token;
        continue;
      }
      throw error;
    }
  }
}

/**
 * Add tracks to a Spotify playlist.
 *
 * Callers must persist ONLY the returned addedTrackIds (plus
 * alreadyPresentTrackIds) to their migration ledger — anything else marks
 * tracks migrated that never reached the destination (P1-8).
 *
 * Throws when the playlist cannot be resolved/created or when no track
 * could be added at all; partial batch failures are reported in
 * failedTrackIds instead of throwing away the successful batches.
 */
export const addToSptPlaylist = async function (
  trackIdsToAdd: string[],
  userId: string,
  playlistName: string,
  destinationPlaylistId?: string,
): Promise<AddToSpotifyResult> {
  const validTrackIds = [
    ...new Set(trackIdsToAdd.filter((id) => id && typeof id === 'string' && id.length === 22)),
  ];

  const playlistId =
    destinationPlaylistId ??
    (await withAuthRetry(userId, (token) => findOrCreatePlaylist(playlistName, token)));

  if (validTrackIds.length === 0) {
    return { playlistId, addedTrackIds: [], alreadyPresentTrackIds: [], failedTrackIds: [] };
  }

  // Destination dedup: without this, every re-run appended duplicates
  // because Spotify (unlike the YouTube path) was never checked (P1-8).
  const existingTrackIds = await withAuthRetry(userId, (token) =>
    fetchExistingPlaylistTrackIds(playlistId, token),
  );

  const alreadyPresentTrackIds = validTrackIds.filter((id) => existingTrackIds.has(id));
  const newTrackIds = validTrackIds.filter((id) => !existingTrackIds.has(id));

  const addedTrackIds: string[] = [];
  const failedTrackIds: string[] = [];

  for (let i = 0; i < newTrackIds.length; i += ADD_BATCH_SIZE) {
    const batch = newTrackIds.slice(i, i + ADD_BATCH_SIZE);
    try {
      await withAuthRetry(userId, (token) =>
        axios.post(
          `https://api.spotify.com/v1/playlists/${playlistId}/items`,
          { uris: batch.map((id) => `spotify:track:${id}`) },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      addedTrackIds.push(...batch);
    } catch (error: any) {
      console.error(
        `[addToSptPlaylist] Batch of ${batch.length} tracks failed:`,
        error.response?.data || error.message,
      );
      failedTrackIds.push(...batch);
    }
  }

  if (newTrackIds.length > 0 && addedTrackIds.length === 0 && alreadyPresentTrackIds.length === 0) {
    throw new Error('ADD_TO_SPOTIFY_FAILED: no tracks could be added to the playlist');
  }

  return { playlistId, addedTrackIds, alreadyPresentTrackIds, failedTrackIds };
};

/**
 * Fetch all track IDs currently in the playlist (paginated, limit 50).
 */
async function fetchExistingPlaylistTrackIds(
  playlistId: string,
  accessToken: string,
): Promise<Set<string>> {
  const existing = new Set<string>();
  let offset = 0;
  let total = 1;

  while (offset < total) {
    const resp = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { offset, limit: PAGE_SIZE, fields: 'total,items(track(id))' },
    });
    total = resp.data.total ?? 0;
    for (const item of resp.data.items ?? []) {
      const id = item?.track?.id;
      if (id) existing.add(id);
    }
    offset += PAGE_SIZE;
  }

  return existing;
}

const findOrCreatePlaylist = async (
  playlistName: string,
  access_Token: string,
): Promise<string> => {
  const existingPlaylistsResponse = await axios.get(
    'https://api.spotify.com/v1/me/playlists?limit=50',
    { headers: { Authorization: `Bearer ${access_Token}` } },
  );

  const existingPlaylist = existingPlaylistsResponse.data.items.find(
    (playlist: any) => playlist.name === playlistName,
  );

  if (existingPlaylist) {
    return existingPlaylist.id;
  }

  return await createPlaylist(playlistName, access_Token);
};

const createPlaylist = async (playlistName: string, access_Token: string): Promise<string> => {
  // Feb-2026 API: playlists are created via POST /me/playlists
  // (POST /users/{id}/playlists was removed).
  const response = await axios.post(
    'https://api.spotify.com/v1/me/playlists',
    { name: playlistName, public: true, description: 'Migrated playlist' },
    {
      headers: {
        Authorization: `Bearer ${access_Token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return response.data.id;
};
