import axios from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../OAuth/tokenManagement/youtubeTokensUtil";

const MAX_RETRIES = 3;
const YT_PLAYLIST_ITEMS_API =
  "https://www.googleapis.com/youtube/v3/playlistItems";
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
  nextPageToken: string | null = null,
  userId: string,
  retryCount = 0
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
        response.data.nextPageToken,
        userId,
        retryCount
      );
    }

    return items;
  } catch (error) {
    const { shouldRetry, newAccessToken } = await handleYouTubeError(
      error,
      retryCount,
      userId
    );

    if (shouldRetry) {
      const updatedToken = newAccessToken || accessToken;
      return fetchPlaylistItemIds(
        playlistId,
        updatedToken,
        items,
        nextPageToken,
        userId,
        retryCount + 1
      );
    }

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
    let attempt = 0;

    while (attempt <= 3) {
      try {
        await axios.delete(`${YT_PLAYLIST_ITEMS_API}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { id: itemId },
        });

        console.log(`Removed playlist item: ${itemId}`);
        await new Promise((res) => setTimeout(res, 100)); // ✅ delay between deletions
        break; // exit loop if successful
      } catch (error) {
        const status = error?.response?.status;

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
          break;
        }

        if (status === 409 && attempt < 3) {
          console.warn(
            `409 Conflict deleting ${itemId}. Retrying (${
              attempt + 1
            }/3) after 500ms...`
          );
          await new Promise((res) => setTimeout(res, 500));
          attempt++;
          continue;
        }

        throw new Error(
          `Failed to remove playlist item ${itemId}: ${error.message}`
        );
      }
    }
  }
};

export const clearYouTubePlaylist = async (
  userId: string,
  playlistId: string
) => {
  let accessToken = await get_YoutubeAccessToken(userId);

  console.log(`Fetching items in playlist: ${playlistId}`);
  const playlistItemIds = await fetchPlaylistItemIds(
    playlistId,
    accessToken,
    [],
    null,
    userId
  );

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
