import axios from 'axios';
import { AxiosError } from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil'; // Ensure these functions are defined

const youtube_Api_Key = process.env.YOUTUBE_API_KEY;

let youtubeTrackArray = [];

const MAX_RETRIES = 10; // Maximum number of retries

export const searchYoutubeTracks = async (req, res) => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_YoutubeAccessToken();
      await fetchYoutubeTracks(accessToken);
      console.log(accessToken);

      res.json({ done: youtubeTrackArray });
      return; // Exit function after successful fetch

    } catch (error) {
      if (error instanceof AxiosError && error.response && error.response.status === 401) {
        console.log("Access token expired, refreshing token...");
        await refreshYoutubeAccessToken();
        retryCount += 1;
        console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
        
        // Continue to retry the fetchYoutubeTracks with the new token
        if (retryCount < MAX_RETRIES) {
          console.log("Retrying fetchYoutubeTracks...");
          continue; // This will restart the while loop with a new access token
        }
        
        // If maximum retries reached
        console.error('Max retries reached. Unable to fetch tracks.');
        res.status(500).json({ error: 'Failed to fetch tracks after multiple attempts' });
        return;
      } else {
        console.error('Error fetching tracks:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch tracks' });
        return;
      }
    }
  }
};

const fetchYoutubeTracks = async (accessToken) => {
  let url = 'https://www.googleapis.com/youtube/v3/playlistItems';
  let allTracks = [];
  let pageToken = ''; // Initialize with empty string for the first request

  try {
    while (url) {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          part: 'snippet',
          playlistId: 'LL', // Replace 'LL' with actual playlist ID
          maxResults: 50,  // Max number of tracks per request
          pageToken: pageToken
        }
      });

      // Extract video IDs from the playlist
      const videoIds = response.data.items.map(item => item.snippet.resourceId.videoId);

      // Fetch video details including duration
      const videoDetailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          part: 'contentDetails',
          id: videoIds.join(','),
          key: youtube_Api_Key
        }
      });

      // Map the video details to the youtubeTrackArray
      allTracks = allTracks.concat(response.data.items.map((item, index) => {
        const description = item.snippet.description.split('\n').join(' '); // Join hashtags with a space

        // Find duration for the current video
        const videoDetail = videoDetailsResponse.data.items.find(video => video.id === item.snippet.resourceId.videoId);
        const duration = videoDetail ? convertDurationToSeconds(videoDetail.contentDetails.duration) : null;

        return {
          trackNumber: index + 1, 
          title: item.snippet.title,
          description: description,
          videoChannelTitle: item.snippet.videoOwnerChannelTitle,
          duration: duration
        };
      }));

      // Check if there is a next page
      pageToken = response.data.nextPageToken || null;
      url = pageToken ? `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50&pageToken=${pageToken}` : null;
    }

    youtubeTrackArray = allTracks;

    console.log("Request sent");

    return youtubeTrackArray;

  } catch (error) {
    throw error; // Propagate the error to be handled in searchYoutubeTracks
  }
};

// Convert ISO 8601 duration to seconds
const convertDurationToSeconds = (duration) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return (hours * 3600) + (minutes * 60) + seconds;
};

export { youtubeTrackArray };
