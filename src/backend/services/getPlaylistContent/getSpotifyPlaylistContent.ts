import axios from "axios";
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from "../../../auth/spotify/spotifyTokenUtil";

const MAX_RETRIES = 2;

export interface SpotifyTrackInfo {
  id: string;
  name: string;
  artists: string[];
  album: string;
  duration_ms: number;
  image_url: string | null;
}


/**
 * Fetches up to `limit` tracks from the given Spotify playlist,
 * handling token expiry with retry.
 */
export async function getSpotifyPlaylistContent(
  userId: string,
  playlistIds: string[],
  limit = 100
): Promise<Record<string, SpotifyTrackInfo[]>> {
  const tokenData = await get_SpotifyAccessToken(userId);
  let token = tokenData;

  const fetchPlaylistTracks = async (playlistId: string): Promise<SpotifyTrackInfo[]> => {
    let offset = 0;
    let allTracks: SpotifyTrackInfo[] = [];
    let total = 1; // dummy to start

    while (allTracks.length < limit && offset < total) {
      let retries = 0;
      while (retries <= MAX_RETRIES) {
        try {
          const resp = await axios.get(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: { offset, limit: Math.min(100, limit - allTracks.length) },
            }
          );
          total = resp.data.total;
          const chunk = resp.data.items
            .filter((item: any) => item.track)
            .map((item: any) => ({
              id: item.track.id,
              name: item.track.name,
              artists: item.track.artists.map((a: any) => a.name),
              album: item.track.album.name,
              duration_ms: item.track.duration_ms,
              image_url: item.track.album.images?.[0]?.url || null,
            }));
          allTracks = allTracks.concat(chunk);
          break; // success
        } catch (err: any) {
          if (err.response?.status === 401 && retries < MAX_RETRIES) {
            const refreshed = await refreshSpotifyToken(userId);
            if (!refreshed?.access_token) throw new Error("Failed to refresh Spotify access token");
            token = refreshed.access_token;
            retries++;
            continue;
          }
          throw err;
        }
      }
      offset += 100;
    }

    return allTracks;
  };

  const result: Record<string, SpotifyTrackInfo[]> = {};

  for (const playlistId of playlistIds) {
    result[playlistId] = await fetchPlaylistTracks(playlistId);
  }

  return result;
}

