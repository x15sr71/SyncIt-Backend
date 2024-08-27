// import axios from 'axios';
// import { get_SpotifyAccessToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';

// // Replace these with actual values

// const access_Token = get_SpotifyAccessToken()

// const likeOrDislikeVideo = async (accessToken, videoId, action) => {
//   try {
//     const response = await axios.post(
//       'https://www.googleapis.com/youtube/v3/videos/rate',
//       null,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           'Content-Type': 'application/json',
//         },
//         params: {
//           id: videoId,
//           rating: "like", // 'like' or 'dislike'
//         },
//       }
//     );
//     console.log('Video rating updated:', response.data);
//   } catch (error) {
//     console.error('Error liking/disliking video:', error.response ? error.response.data : error.message);
//   }
// };

// // Call the function
// likeOrDislikeVideo(access_Token, VIDEO_ID, LIKE_ACTION);
