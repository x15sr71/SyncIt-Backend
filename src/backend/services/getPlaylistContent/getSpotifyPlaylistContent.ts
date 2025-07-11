import axios from "axios";
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from "../../../OAuth/tokenManagement/spotifyTokenUtil";

const MAX_RETRIES = 2;

export interface SpotifyTrackInfo {
  id: string;
  name: string;
  artists: string[];
  album: string;
  duration_ms: number;
}

/**
 * Fetches up to `limit` tracks from the given Spotify playlist,
 * handling token expiry with retry.
 */
export async function getSpotifyPlaylistContent(
  userId: string,
  playlistId: string,
  limit = 100
): Promise<SpotifyTrackInfo[]> {
  if (!userId || !playlistId) {
    throw new Error("Missing userId or playlistId");
  }

  let retries = 0;
  let token = await get_SpotifyAccessToken(userId);

  while (retries <= MAX_RETRIES) {
    try {
      const resp = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit },
        }
      );

      return resp.data.items.map((item: any) => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map((a: any) => a.name),
        album: item.track.album.name,
        duration_ms: item.track.duration_ms,
      }));
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401 && retries < MAX_RETRIES) {
        token = (await refreshSpotifyToken(userId)).access_token;
        retries++;
        continue;
      }
      throw err;
    }
  }

  // should never reach here
  return [];
}
