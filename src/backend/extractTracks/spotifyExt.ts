import axios, { AxiosError } from "axios";
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from "../../OAuth/tokenManagement/spotifyTokenUtil";
import { hashId } from "../../OAuth/utility/encrypt";
import prisma from "../../db";

// Define types for the Spotify API response and tracks
interface SpotifyArtist {
  name: string;
}

interface SpotifyAlbum {
  name: string;
  album_type: string;
  release_date: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
}

interface SpotifyTrackItem {
  track: SpotifyTrack;
}

interface SpotifyTrackResponse {
  items: SpotifyTrackItem[];
  next: string | null;
}

interface RefreshedTokenData {
  access_token: string;
}

const MAX_RETRIES = 3; // Maximum number of retries
const MAX_TRACKS = 100; // Maximum number of tracks to fetch

export const searchSpotifyTracks = async (req, res): Promise<void> => {
  let retryCount = 0;
  let accessToken: string | null = null;
  const userId = req.session.id;

  if (!userId) {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  while (retryCount < MAX_RETRIES) {
    try {
      accessToken = await get_SpotifyAccessToken(userId);
      console.log("Initial access token:", accessToken);

      if (!accessToken) {
        console.error("Access token not found or invalid.");
        return res.status(401).json({
          error: "AUTH_ERROR",
          message: "Access token not found or expired. Please log in again.",
        });
      }

      const tracks = await fetchSpotifyTracks(accessToken, userId);
      console.log("Fetched tracks:", tracks);
      return res.json({ status: "success", data: tracks });
    } catch (error) {
      const isUnauthorized =
        error instanceof AxiosError && error.response?.status === 401;

      if (isUnauthorized) {
        console.warn("Access token expired. Attempting to refresh...");

        try {
          const refreshedTokenData = (await refreshSpotifyToken(
            userId
          )) as RefreshedTokenData;

          if (refreshedTokenData?.access_token) {
            accessToken = refreshedTokenData.access_token;
            retryCount += 1;
            console.log(
              `Token refreshed. Retrying... (${retryCount}/${MAX_RETRIES})`
            );
            continue; // Retry with new token
          }

          console.error("Failed to refresh access token.");
          return res.status(401).json({
            error: "AUTH_REFRESH_FAILED",
            message: "Failed to refresh access token. Please log in again.",
          });
        } catch (refreshError) {
          console.error(
            "Error refreshing token:",
            (refreshError as Error).message
          );
          return res.status(401).json({
            error: "AUTH_REFRESH_FAILED",
            message: "Failed to refresh access token. Please log in again.",
          });
        }
      } else {
        console.error(
          "Error fetching tracks:",
          error instanceof AxiosError
            ? error.response?.data
            : (error as Error).message
        );
        return res.status(500).json({
          error: "TRACK_FETCH_FAILED",
          message: "Failed to fetch tracks. Please try again later.",
        });
      }
    }
  }

  console.error("Exceeded max retries while trying to fetch Spotify tracks.");
  return res.status(429).json({
    error: "MAX_RETRIES_EXCEEDED",
    message: "Exceeded retry limit. Please try again later.",
  });
};

const fetchSpotifyTracks = async (
  accessToken: string,
  userId: string
): Promise<SpotifyTrack[]> => {
  let url: string | null = "https://api.spotify.com/v1/me/tracks";
  let allTracks: SpotifyTrack[] = [];
  let totalFetchedTracks = 0;

  console.log("Fetching tracks...");

  while (url && totalFetchedTracks < MAX_TRACKS) {
    const response = await axios.get<SpotifyTrackResponse>(url, {
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
      artists: item.track.artists.map((artist) => ({ name: artist.name })),
      album: {
        name: item.track.album.name,
        album_type: item.track.album.album_type,
        release_date: item.track.album.release_date,
      },
      duration_ms: item.track.duration_ms,
    }));

    allTracks = [...allTracks, ...fetchedTracks];
    totalFetchedTracks += fetchedTracks.length;

    const trackIDs = response.data.items.map((item) => item.track.id);
    const serializedTracks = JSON.stringify(trackIDs);
    const { hash } = hashId(response);

    await prisma.spotifyData.updateMany({
      where: { userId },
      data: {
        last_playlistTrackIds_hash: hash,
        last_SyncedAt: new Date(),
        last_TrackIds: serializedTracks,
      },
    });

    url = response.data.next;
  }

  console.log(`Total tracks fetched: ${allTracks.length} tracks.`);
  return allTracks;
};
