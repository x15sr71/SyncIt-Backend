// import axios, { AxiosError } from 'axios';
// import { get_SpotifyAccessToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';
// import { refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';

// const MAX_RETRIES = 5;

// export const removeFromSptLikePlaylist = async function (req, res) {
//   let retryCount = 0;
//   while(retryCount < MAX_RETRIES) {
//     try {
//       console.log("************************************************************************************")
//       await removeFromLikePlaylist()
//       res.json({
//         done: "done"
//       })
//       return;
//     } catch(error) {

//       if( error instanceof AxiosError && error.response && error.response.data.code === 401 ) {
//         console.log("Access token expired, refreshing token...");
//         await refreshSpotifyToken()
//         retryCount++;
//         console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
//       } else {
//         console.log(error);
//         res.status(500).json({ error: 'An error occurred while modifying the playlist' });
//         return;
//       }
//     }
//   }
// }

// const removeFromLikePlaylist = async () => {
//     try {
//       const access_Token = await get_SpotifyAccessToken();
//       const response = await axios.delete(
//         'https://api.spotify.com/v1/me/tracks',
//         {
//           headers: {
//             Authorization: `Bearer ${access_Token}`,
//           },
//           data: {
//             ids: [
//               "6GyFP1nfCDB8lbD2bG0Hq9",
//               "3ZE3wv8V3w2T2f7nOCjV0N",
//               "596lDSwIMzDoiq3E6jJ0wC",
//               "1QQ1Dx8dcLgWvUaY5fk84y"
//             ]
//           }
//         }
//       );
//       console.log('Tracks removed from the liked playlist:', response.data);
//     } catch (error) {
//       console.error('Error removing tracks from the liked playlist:', error.response ? error.response.data : error.message);
//       throw error;
//     }
//   };
