import axios, { AxiosError } from "axios";
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from "../../OAuth/tokenManagement/youtubeTokensUtil";

const youtube_Api_Key = process.env.YOUTUBE_API_KEY;
const MAX_RETRIES = 5;
const MAX_TRACKS = 40;

export const searchYoutubeTracks = async (req, res) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const accessToken = await get_YoutubeAccessToken(userId);
      const fetchedTracks = await fetchYoutubeTracks(accessToken);
      return res.json({ success: true, data: fetchedTracks });
    } catch (error) {
      const isUnauthorized =
        error instanceof AxiosError && error.response?.status === 401;

      if (isUnauthorized) {
        const refreshed = await refreshYoutubeAccessToken(userId);

        if (refreshed.success) {
          retryCount++;
          continue;
        }

        return res.status(401).json({
          success: false,
          redirect: "/youtube/login",
          error: "AUTH_REFRESH_FAILED",
          message: "Failed to refresh YouTube access token. Please log in again.",
        });
      }

      return res.status(500).json({
        success: false,
        error: "TRACK_FETCH_FAILED",
        message: error.message || "Failed to fetch YouTube tracks.",
      });
    }
  }

  return res.status(429).json({
    success: false,
    error: "MAX_RETRIES_EXCEEDED",
    message: "Exceeded retry limit while fetching tracks.",
  });
};

const fetchYoutubeTracks = async (accessToken: string) => {
  let url = "https://www.googleapis.com/youtube/v3/playlistItems";
  let allTracks = [];
  let pageToken = "";
  let trackCounter = 1;
  let totalTracksFetched = 0;

  while (url && totalTracksFetched < MAX_TRACKS) {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        part: "snippet",
        playlistId: "LL",
        maxResults: 50,
        pageToken: pageToken,
      },
    });

    const videoIds = response.data.items.map(
      (item) => item.snippet.resourceId.videoId
    );

    const videoDetailsResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/videos",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          part: "contentDetails",
          id: videoIds.join(","),
          key: youtube_Api_Key,
        },
      }
    );

    const newTracks = response.data.items.map((item, index) => {
      const videoId = item.snippet.resourceId.videoId;
      const videoDetail = videoDetailsResponse.data.items.find(
        (video) => video.id === videoId
      );
      const duration = convertDurationToMinutesAndSeconds(
        videoDetail?.contentDetails?.duration || ""
      );

      return {
        trackNumber: trackCounter++,
        title: item.snippet.title,
        description: item.snippet.description?.replace(/\n/g, " "),
        videoChannelTitle: item.snippet.videoOwnerChannelTitle,
        duration,
        publishedDate: item.snippet.publishedAt.split("T")[0],
      };
    });

    allTracks.push(...newTracks);
    totalTracksFetched += newTracks.length;

    pageToken = response.data.nextPageToken || null;
    url = pageToken ? url : null;
  }

  return allTracks;
};

const convertDurationToMinutesAndSeconds = (duration: string) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  const totalMinutes = hours * 60 + minutes;

  return `${totalMinutes}:${String(seconds).padStart(2, "0")}`;
};
