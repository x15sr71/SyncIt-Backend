import axios from 'axios';
import { AxiosError } from 'axios';
import { get_AccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil'; // Ensure this exports a function
import { refreshYoutubeAccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil'; // Ensure this exports a function

const youtube_Api_Key = process.env.YOUTUBE_API_KEY;

let youtubeTrackArray = [];

const MAX_RETRIES = 10; // Maximum number of retries

export const searchYoutubeTracks = async (req, res) => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_AccessToken();
      await fetchYoutubeTracks(accessToken);
      //console.log(accessToken)

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
  try {
    const video_response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        part: 'snippet',
        playlistId: 'LL', // Replace 'LL' with actual playlist ID
        maxResults: 20,
        nextPageToken: ''
      }
    });

    // Extract video IDs from the playlist
    const videoIds = video_response.data.items.map(item => item.snippet.resourceId.videoId);

    // Fetch video details including duration
    const video_duration_response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
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
      youtubeTrackArray = video_response.data.items.map((item, index) => {
      const description = item.snippet.description.split('\n').join(' '); // Join hashtags with a space

      // Find duration for the current video
      const videoDetail = video_duration_response.data.items.find(video => video.id === item.snippet.resourceId.videoId);
      const duration = videoDetail ? convertDurationToSeconds(videoDetail.contentDetails.duration) : null;

      return {
        trackNumber: index + 1, 
        title: item.snippet.title,
        description: description,
        videoChannelTitle: item.snippet.videoOwnerChannelTitle,
        duration: duration
      };
    });

    // console.log('--------------------------------------------');
    // youtubeTrackArray.forEach(video => {
    //   console.log(`TrackNumber: ${video.trackNumber}`);
    //   console.log(`Title: ${video.title}`);
    //   console.log(`Video Channel Title: ${video.videoChannelTitle}`);
    //   console.log(`Description: ${video.description}`);
    //   console.log(`Duration: ${video.duration} seconds`);
    //   console.log('-------------------------------------');
    // });

    console.log("Request sent");

    return youtubeTrackArray;

  } catch(error) {
    throw(error);
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
