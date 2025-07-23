import axios, { AxiosError } from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../auth/youtube/youtubeTokensUtil";

const MAX_RETRIES = 5;

/**
 * Add an array of videos to a YouTube playlist, retrying on 401 up to MAX_RETRIES.
 * Skips duplicates already in the playlist.
 * 
 * Returns an array of video IDs that were actually successfully added.
 */
export async function addToYoutubePlaylist(
  userId: string,
  videoIds: string[],
  youtubePlaylistId: string
): Promise<string[]> {       // CHANGED: no longer void, now returns array
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_YoutubeAccessToken(userId);

      // Get current video IDs in the playlist
      const existingVideoIds = await fetchExistingVideoIds(
        youtubePlaylistId,
        accessToken
      );

      // Filter out duplicates
      const uniqueVideoIds = videoIds.filter(
        (id) => !existingVideoIds.has(id)
      );

      if (uniqueVideoIds.length === 0) {
        console.log("🚫 No new videos to add — all already exist in playlist.");
        return [];    // CHANGED: Return empty array
      }

      // Proceed to add unique videos
      const actuallyAdded = await addVideosToPlaylist(accessToken, uniqueVideoIds, youtubePlaylistId);
      return actuallyAdded;      // CHANGED: Return successfully added IDs
    } catch (err: any) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        console.warn(
          `YouTube access token expired (attempt ${retryCount + 1}), refreshing…`
        );
        await refreshYoutubeAccessToken(userId);
        retryCount++;
        continue;
      }
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
 * Helper: fetches all existing video IDs in the given playlist.
 */
async function fetchExistingVideoIds(
  playlistId: string,
  accessToken: string
): Promise<Set<string>> {
  const existingIds = new Set<string>();
  let nextPageToken: string | undefined = undefined;

  do {
    const resp = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlistItems",
      {
        params: {
          part: "contentDetails",
          playlistId,
          maxResults: 50,
          pageToken: nextPageToken,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const items = resp.data.items || [];
    for (const item of items) {
      const id = item?.contentDetails?.videoId;
      if (id) existingIds.add(id);
    }

    nextPageToken = resp.data.nextPageToken;
  } while (nextPageToken);

  return existingIds;
}

/**
 * Posts each video ID into the given playlist.
 * Returns the video IDs that were successfully added (YouTube API 200).
 */
async function addVideosToPlaylist(
  accessToken: string,
  videoIds: string[],
  playlistId: string
): Promise<string[]> {        // CHANGED: Return success array
  const url =
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet";
  const added: string[] = [];   // CHANGED: collect successful adds

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
      added.push(videoId);    // track success
    } catch (err: any) {
      console.error(
        `❌ Error adding video ${videoId} to playlist ${playlistId}:`,
        err.message || err
      );
    }
  }
  return added;               // CHANGED: Return successful adds
}
