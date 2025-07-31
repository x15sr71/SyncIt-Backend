import axios from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../auth/youtube/youtubeTokensUtil";
import iso8601Duration from "iso8601-duration";

const MAX_RETRIES = 2;

export const getYouTubePlaylistContentService = async (
  userId: string,
  playlistId: string
) => {
  let retryCount = 0;
  let accessToken: string | null = await get_YoutubeAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      // 1. Fetch playlist items (basic info + videoIds)
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            part: "snippet,contentDetails",
            maxResults: 50,
            playlistId,
          },
        }
      );

      const rawItems = response.data.items;

      // 2. Extract videoIds
      const videoIdsArray = rawItems
        .map((item) => item.contentDetails.videoId)
        .filter(Boolean);

      const itemsWithoutDuration = rawItems.map((item: any) => ({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.videoOwnerChannelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.default?.url,
      }));

      // 3. Try fetching durations (non-critical)
      try {
        const videoDetailsRes = await axios.get(
          "https://www.googleapis.com/youtube/v3/videos",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params: {
              part: "contentDetails",
              id: videoIdsArray.join(","),
            },
          }
        );

        const durationMap: Record<string, string> = {};
        videoDetailsRes.data.items.forEach((video: any) => {
          const isoDuration = video.contentDetails.duration;
          const parsed = iso8601Duration.parse(isoDuration);
          const minutes = parsed.minutes || 0;
          const seconds = parsed.seconds || 0;
          const formattedDuration = `${minutes}:${seconds
            .toString()
            .padStart(2, "0")}`;
          durationMap[video.id] = formattedDuration;
        });

        // 4. Attach durations to playlist items
        const itemsWithDuration = itemsWithoutDuration.map((item) => ({
          ...item,
          duration: durationMap[item.videoId] || "0:00",
        }));

        return { success: true, data: itemsWithDuration };
      } catch (durationError) {
        console.warn("Video durations fetch failed. Sending fallback response.");
        return { success: true, data: itemsWithoutDuration };
      }
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        const newToken = await refreshYoutubeAccessToken(userId);
        if (newToken.success && typeof newToken.newAccessToken === "string") {
          accessToken = newToken.newAccessToken;
          retryCount++;
          continue;
        } else {
          throw {
            success: false,
            error: "AUTH_REFRESH_FAILED",
            message: "Failed to refresh token.",
            statusCode: 401,
          };
        }
      }

      console.error(
        "YouTube content fetch error:",
        error?.response?.data || error.message
      );
      throw {
        success: false,
        error: "YOUTUBE_CONTENT_FETCH_FAILED",
        message: "Failed to fetch playlist contents.",
        statusCode: 500,
      };
    }
  }

  throw {
    success: false,
    error: "MAX_RETRIES_EXCEEDED",
    message: "Retry limit exceeded while fetching playlist content.",
    statusCode: 500,
  };
};
