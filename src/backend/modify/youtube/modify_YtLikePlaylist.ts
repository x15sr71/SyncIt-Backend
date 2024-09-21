import axios from 'axios';
import { AxiosError } from 'axios';
import { get_YoutubeAccessToken } from '../../../OAuth/tokenManagement/youtubeTokensUtil';
import { refreshYoutubeAccessToken } from '../../../OAuth/tokenManagement/youtubeTokensUtil';

const MAX_RETRIES = 5;

export const modify_YoutubePlaylist = async function (req, res) {
    let retryCount = 0;
    while (retryCount < MAX_RETRIES) {
        try {
            const videoIds = ['VIDEO_ID_1', 'VIDEO_ID_2']; // Replace with your video IDs
            const playlistId = 'YOUR_PLAYLIST_ID'; // Replace with your playlist ID
            await addVideosToPlaylist(videoIds, playlistId);
            res.json({
                done: "done"
            });
            return;
        } catch (error) {
            if (error instanceof AxiosError && error.response && error.response.status === 401) {
                console.log("Access token expired, refreshing token...");
                await refreshYoutubeAccessToken();
                retryCount++;
                console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
            } else {
                console.log(error);
                res.status(500).json({ error: 'An error occurred while modifying the playlist' });
                return;
            }
        }
    }
    console.error('Max retries reached. Unable to process the request.');
    res.status(500).json({ error: 'Failed to modify playlist after multiple attempts' });
}

const addVideosToPlaylist = async (videoIds, playlistId) => {
    const accessToken = await get_YoutubeAccessToken();

    for (const videoId of videoIds) {
        try {
            const response = await axios.post(
                'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
                {
                    snippet: {
                        playlistId: "PLY6KwKMkfULVfUn8i6MQP9i6XqKYdG-LK",
                        resourceId: {
                            kind: 'youtube#video',
                            videoId: videoId
                        }
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`Video ${videoId} added to playlist:`, response.data);
        } catch (error) {
            console.error(`Error adding video ${videoId} to playlist:`, error);
        }
    }
};
