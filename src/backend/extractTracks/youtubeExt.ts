import axios from "axios";
import { AxiosError } from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../OAuth/tokenManagement/youtubeTokensUtil";

const youtube_Api_Key = process.env.YOUTUBE_API_KEY;

let youtubeTrackArray = [];

const MAX_RETRIES = 5;
const MAX_TRACKS = 40;

// Function to convert ISO 8601 duration to seconds
const convertDurationToMinutesAndSeconds = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  // Total minutes
  const totalMinutes = hours * 60 + minutes;
  return `${totalMinutes}:${String(seconds).padStart(2, "0")}`; // Format as "MM:SS"
};

export const searchYoutubeTracks = async () => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_YoutubeAccessToken();
      const fetchedTracks = await fetchYoutubeTracks(accessToken);
      //console.log(fetchedTracks)
      return { success: true, data: fetchedTracks };
    } catch (error) {
      if (error.message === "Access token not found") {
        console.error("Access token not found, cannot proceed.");
        return { success: false, error: "Access token not found" };
      }

      if (
        error instanceof AxiosError &&
        error.response &&
        error.response.status === 401
      ) {
        console.log("Access token expired, refreshing token...");
        const refreshSuccess = await refreshYoutubeAccessToken();
        if (refreshSuccess) {
          retryCount += 1;
          console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);

          if (retryCount < MAX_RETRIES) {
            console.log("Retrying fetchYoutubeTracks...");
            continue;
          } else {
            console.error("Max retries reached. Unable to fetch tracks.");
            return { success: false, error: "Max retries reached" };
          }
        } else {
          console.error("Error refreshing token");
          return {
            success: false,
            error: "Failed to refresh YouTube access token",
          };
        }
      } else {
        console.error(
          "Error fetching tracks:",
          error.response ? error.response.data : error.message
        );
        return { success: false, error: "Failed to fetch tracks" };
      }
    }
  }
};

const fetchYoutubeTracks = async (accessToken) => {
  let url = "https://www.googleapis.com/youtube/v3/playlistItems";
  let allTracks = [];
  let pageToken = "";
  let trackCounter = 1;
  let totalTracksFetched = 0;

  try {
    while (url && totalTracksFetched < MAX_TRACKS) {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          part: "snippet",
          playlistId: "PLY6KwKMkfULVfUn8i6MQP9i6XqKYdG-LK",
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
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            part: "contentDetails",
            id: videoIds.join(","),
            key: youtube_Api_Key,
          },
        }
      );

      const remainingTracks = MAX_TRACKS - totalTracksFetched;

      const newTracks = response.data.items
        .slice(0, remainingTracks)
        .map((item) => {
          const description = item.snippet.description.split("\n").join(" ");
          const videoDetail = videoDetailsResponse.data.items.find(
            (video) => video.id === item.snippet.resourceId.videoId
          );
          const duration = videoDetail
            ? convertDurationToMinutesAndSeconds(
                videoDetail.contentDetails.duration
              )
            : null;

          // Get the published date in the specified format
          const publishedDate = new Date(item.snippet.publishedAt)
            .toISOString()
            .split("T")[0];

          return {
            trackNumber: trackCounter++,
            title: item.snippet.title,
            description: description,
            videoChannelTitle: item.snippet.videoOwnerChannelTitle,
            duration: duration, // Add duration here
            publishedDate: publishedDate, // Add published date here
          };
        });

      allTracks = allTracks.concat(newTracks);
      totalTracksFetched += newTracks.length;

      pageToken = response.data.nextPageToken || null;
      url =
        pageToken && totalTracksFetched < MAX_TRACKS
          ? `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50&pageToken=${pageToken}`
          : null;
    }

    youtubeTrackArray = allTracks;
    console.log("Request sent, total tracks fetched:", totalTracksFetched);

    return youtubeTrackArray;
  } catch (error) {
    throw error;
  }
};
