// src/services/addTo/youtube.ts

import axios, { AxiosError } from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../OAuth/tokenManagement/youtubeTokensUtil";

const MAX_RETRIES = 5;

/**
 * Add an array of videos to a YouTube playlist, retrying on 401 up to MAX_RETRIES.
 *
 * @param userId           Your internal user identifier
 * @param videoIds         Array of YouTube video IDs to add
 * @param youtubePlaylistId  The target YouTube playlist ID
 */
export async function addToYoutubePlaylist(
  userId: string,
  videoIds: string[],
  youtubePlaylistId: string
): Promise<void> {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      // Ensure we have a valid access token (this will throw if there's no token)
      let accessToken = await get_YoutubeAccessToken(userId);

      // Attempt to add all videos
      await addVideosToPlaylist(accessToken, videoIds, youtubePlaylistId);
      return;
    } catch (err: any) {
      // If we got a 401, refresh and retry
      if (err instanceof AxiosError && err.response?.status === 401) {
        console.warn(
          `YouTube access token expired (attempt ${
            retryCount + 1
          }), refreshing…`
        );
        await refreshYoutubeAccessToken(userId);
        retryCount++;
        continue;
      }

      // Otherwise, bubble up
      throw new Error(
        `addToYoutubePlaylist failed on attempt ${retryCount + 1}: ${
          err.message
        }`
      );
    }
  }

  throw new Error(
    `addToYoutubePlaylist: exceeded max retries (${MAX_RETRIES})`
  );
}

/**
 * Low‑level helper: posts each video ID into the given playlist.
 *
 * @param accessToken       A valid YouTube OAuth access token
 * @param videoIds          Array of YouTube video IDs
 * @param playlistId        The target YouTube playlist ID
 */
async function addVideosToPlaylist(
  accessToken: string,
  videoIds: string[],
  playlistId: string
): Promise<void> {
  const url =
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet";

  for (const videoId of videoIds) {
    try {
      await axios.post(
        url,
        {
          snippet: {
            playlistId: playlistId,
            resourceId: {
              kind: "youtube#video",
              videoId: videoId,
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`✅ Added video ${videoId} to playlist ${playlistId}`);
    } catch (err: any) {
      // Log & continue on per-video errors
      console.error(
        `❌ Error adding video ${videoId} to playlist ${playlistId}:`,
        err.message || err
      );
    }
  }
}
