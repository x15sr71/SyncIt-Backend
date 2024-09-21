import axios from 'axios';
import { AxiosError } from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil'; 

const youtube_Api_Key = process.env.YOUTUBE_API_KEY;

let youtubeTrackArray = [];

const MAX_RETRIES = 10; 
const MAX_TRACKS = 200; 

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
            if (error.message === 'Access token not found') {
                console.error("Access token not found, cannot proceed.");
                res.status(500).json({ error: 'Access token not found' });
                return;
            }

            if (error instanceof AxiosError && error.response && error.response.status === 401) {
                console.log("Access token expired, refreshing token...");
                const refreshSuccess = await refreshYoutubeAccessToken();
                if (refreshSuccess) {
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
                    console.error('Error refreshing token');
                    res.status(500).json({ error: 'Failed to refresh YouTube access token' });
                    return;
                }
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
    let trackCounter = 1; // Global track counter starting at 1
    let totalTracksFetched = 0; // Counter to track the total number of tracks fetched

    try {
        while (url && totalTracksFetched < MAX_TRACKS) {
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
            //console.log(videoIds);

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

            // Calculate the number of tracks left to fetch
            const remainingTracks = MAX_TRACKS - totalTracksFetched;

            // Map the video details to the youtubeTrackArray
            const newTracks = response.data.items.slice(0, remainingTracks).map((item) => {
                const description = item.snippet.description.split('\n').join(' '); // Join hashtags with a space

                // Find duration for the current video
                const videoDetail = videoDetailsResponse.data.items.find(video => video.id === item.snippet.resourceId.videoId);
                // const duration = videoDetail ? convertDurationToSeconds(videoDetail.contentDetails.duration) : null;

                // Return the track with the global track counter
                return {
                    trackNumber: trackCounter++, // Increment trackCounter for each track
                    title: item.snippet.title,
                    description: description,
                    videoChannelTitle: item.snippet.videoOwnerChannelTitle,
                    // duration: duration
                };
            });

            allTracks = allTracks.concat(newTracks);
            totalTracksFetched += newTracks.length; // Update total tracks fetched so far

            // Check if there is a next page and if we still need more tracks
            pageToken = response.data.nextPageToken || null;
            url = pageToken && totalTracksFetched < MAX_TRACKS ? `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50&pageToken=${pageToken}` : null;
        }

        youtubeTrackArray = allTracks;

        console.log("Request sent, total tracks fetched:", totalTracksFetched);

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
