import axios, { AxiosError } from "axios";
import prisma from "../../db";
import { get_SpotifyAccessToken, refreshSpotifyToken } from "../../auth/spotify/spotifyTokenUtil";
import { hashId } from "../utility/encrypt";

const MAX_RETRIES = 3;
const MAX_TRACKS = 100;

export const searchSpotifyTracks = async (req, res): Promise<void> => {
  const userId = req.session?.id;
  if (!userId) {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  let retryCount = 0;
  let accessToken: string | null = null;

while (retryCount < MAX_RETRIES) {
  try {
    if (!accessToken) {
      accessToken = await get_SpotifyAccessToken(userId);
    }

    if (!accessToken) {
      return res.status(401).json({
        error: "AUTH_ERROR",
        message: "Access token not found or expired. Please log in again.",
      });
    }

    const tracks = await fetchSpotifyTracks(accessToken, userId);
    return res.json({ success: true, data: tracks });

  } catch (error) {
    const isUnauthorized =
      error instanceof AxiosError && error.response?.status === 401;

    if (isUnauthorized) {
      const refreshed = await refreshSpotifyToken(userId);

      if (refreshed?.access_token) {
        accessToken = refreshed.access_token; // use directly
        retryCount++;
        continue;
      }

      return res.status(401).json({
        success: false,
        redirect: "/spotify/login",
        error: "AUTH_REFRESH_FAILED",
        message: "Failed to refresh access token. Please log in again.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "TRACK_FETCH_FAILED",
      message: "Failed to fetch tracks. Please try again later.",
    });
  }
}


  return res.status(429).json({
    success: false,
    error: "MAX_RETRIES_EXCEEDED",
    message: "Exceeded retry limit. Please try again later.",
  });
};

const fetchSpotifyTracks = async (accessToken: string, userId: string) => {
  let url: string | null = "https://api.spotify.com/v1/me/tracks";
  let allTracks = [];
  let totalFetchedTracks = 0;

  while (url && totalFetchedTracks < MAX_TRACKS) {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: Math.min(50, MAX_TRACKS - totalFetchedTracks),
        offset: totalFetchedTracks,
      },
    });

    const fetchedTracks = response.data.items.map((item) => ({
      id: item.track.id,
      name: item.track.name,
      artists: item.track.artists.map((a) => ({ name: a.name })),
      album: {
        name: item.track.album.name,
        album_type: item.track.album.album_type,
        release_date: item.track.album.release_date,
      },
      duration_ms: item.track.duration_ms,
    }));

    const trackIDs = response.data.items.map((item) => item.track.id);
    const { hash } = hashId(response);
    const serializedTracks = JSON.stringify(trackIDs);

    await prisma.spotifyData.updateMany({
      where: { userId }, // Match by userId
      data: {
        last_playlistTrackIds_hash: hash,
        last_SyncedAt: new Date(),
        last_TrackIds: serializedTracks,
      },
    });

    allTracks.push(...fetchedTracks);
    totalFetchedTracks += fetchedTracks.length;
    url = response.data.next;
  }

  return allTracks;
};
