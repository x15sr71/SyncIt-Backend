// src/services/youtube/clearYouTubePlaylist.ts

import axios from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../OAuth/tokenManagement/youtubeTokensUtil";

const MAX_RETRIES = 3;
const YT_PLAYLIST_ITEMS_API = "https://www.googleapis.com/youtube/v3/playlistItems";
const DEFAULT_RETRY_DELAY = 1000;

const handleYouTubeError = async (error, retryCount, userId) => {
  const { response } = error;

  if (!response) {
    console.error("Network error:", error.message);
    return { shouldRetry: false };
  }

  const { status, data, headers } = response;

  if (status === 401 && retryCount < MAX_RETRIES) {
    console.warn("YouTube access token expired. Refreshing...");
    try {
      await refreshYoutubeAccessToken(userId);
      const newToken = await get_YoutubeAccessToken(userId);
      return { shouldRetry: true, newAccessToken: newToken };
    } catch (refreshError) {
      console.error("YouTube token refresh failed:", refreshError.message);
    }
  } else if (status === 403 || status === 429) {
    const retryAfter = headers["retry-after"]
      ? parseInt(headers["retry-after"], 10) * 1000
      : DEFAULT_RETRY_DELAY;
    console.warn(`Rate limited. Retrying after ${retryAfter} ms...`);
    await new Promise((res) => setTimeout(res, retryAfter));
    return { shouldRetry: true };
  } else {
    console.error(
      `YouTube API error (${status}):`,
      data?.error?.message || error.message
    );
  }

  return { shouldRetry: false };
};

const fetchPlaylistItemIds = async (
  playlistId: string,
  accessToken: string,
  items: string[] = [],
  nextPageToken: string | null = null
): Promise<string[]> => {
  try {
    const response = await axios.get(YT_PLAYLIST_ITEMS_API, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        part: "id",
        playlistId,
        maxResults: 50,
        pageToken: nextPageToken || "",
      },
    });

    const itemIds = response.data.items.map((item) => item.id);
    items.push(...itemIds);

    if (response.data.nextPageToken) {
      return fetchPlaylistItemIds(
        playlistId,
        accessToken,
        items,
        response.data.nextPageToken
      );
    }

    return items;
  } catch (error) {
    throw new Error(`Failed to fetch YouTube playlist items: ${error.message}`);
  }
};

const removeItemsFromPlaylist = async (
  playlistItemIds: string[],
  accessToken: string,
  userId: string,
  retryCount = 0
): Promise<void> => {
  for (const itemId of playlistItemIds) {
    try {
      await axios.delete(`${YT_PLAYLIST_ITEMS_API}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { id: itemId },
      });

      console.log(`Removed playlist item: ${itemId}`);
    } catch (error) {
      const { shouldRetry, newAccessToken } = await handleYouTubeError(
        error,
        retryCount,
        userId
      );

      if (shouldRetry) {
        const tokenToUse = newAccessToken || accessToken;
        await removeItemsFromPlaylist(
          [itemId],
          tokenToUse,
          userId,
          retryCount + 1
        );
        continue;
      }

      throw new Error(`Failed to remove playlist item ${itemId}: ${error.message}`);
    }
  }
};

export const clearYouTubePlaylist = async (
  userId: string,
  playlistId: string
) => {
//   if (!userId || !playlistId) throw new Error("Missing userId or playlistId");

  let accessToken = await get_YoutubeAccessToken(userId);

  console.log(`Fetching items in playlist: ${playlistId}`);
  const playlistItemIds = await fetchPlaylistItemIds("PLY6KwKMkfULW2bGdfKhzHa8mEf9joJwXK", accessToken);

  if (playlistItemIds.length === 0) {
    return {
      success: true,
      message: "No items in the playlist. Nothing to remove.",
      removedCount: 0,
    };
  }

  console.log(`Removing ${playlistItemIds.length} items from playlist...`);
  await removeItemsFromPlaylist(playlistItemIds, accessToken, userId);

  return {
    success: true,
    message: `Successfully removed ${playlistItemIds.length} items.`,
    removedCount: playlistItemIds.length,
  };
};
