import axios from 'axios';
import { AxiosError } from 'axios';
import { get_AccessToken } from '../../../OAuth/tokenManagement/youtubeTokensUtil';
import { refreshYoutubeAccessToken } from '../../../OAuth/tokenManagement/youtubeTokensUtil';

const MAX_RETRIES = 5;

export const modify_YotutubeLikePlaylist = async function (req, res) {
    let retryCount = 0;
    while(retryCount < MAX_RETRIES)
    {
        try {
        await likeOrDislikeVideo()
        res.json({
            done: "done"
        })
        return;
        }
        catch(error) {
            if(error instanceof AxiosError && error.response && error.response.status === 401) {
               console.log("Access token expired, refreshing token...");
               await refreshYoutubeAccessToken()
               retryCount++;
               console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
            }
            else {
              console.log(error);
              res.status(500).json({ error: 'An error occurred while modifying the playlist' });
              return;
              }                
            }
        }
    console.error('Max retries reached. Unable to process the request.');
    res.status(500).json({ error: 'Failed to modify playlist after multiple attempts' });
    }

const likeOrDislikeVideo = async () => {
  try {
    const access_Token = await get_AccessToken()
    const response = await axios.post(
      'https://www.googleapis.com/youtube/v3/videos/rate',
      null,
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
        },
        params: {
          id: 'nRnbuDvk7zM',
          rating: 'like', // 'like' or 'dislike'
        },
      }
    );
    console.log('Video rating updated:', response.data);
  } catch (error) {
    throw error
  }
};

