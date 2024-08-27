import axios from 'axios';

// Replace these with actual values
const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN';
const VIDEO_ID = 'VIDEO_ID'; // The ID of the video you want to like or dislike
const LIKE_ACTION = 'like'; // or 'dislike' for disliking

const likeOrDislikeVideo = async (accessToken, videoId, action) => {
  try {
    const response = await axios.post(
      'https://www.googleapis.com/youtube/v3/videos/rate',
      null,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          id: videoId,
          rating: "dislike", // 'like' or 'dislike'
        },
      }
    );
    console.log('Video rating updated:', response.data);
  } catch (error) {
    console.error('Error liking/disliking video:', error.response ? error.response.data : error.message);
  }
};

// Call the function
likeOrDislikeVideo(ACCESS_TOKEN, VIDEO_ID, LIKE_ACTION);
