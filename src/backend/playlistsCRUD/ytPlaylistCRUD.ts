import axios from "axios";
import { get_YoutubeAccessToken } from "../../OAuth/tokenManagement/youtubeTokensUtil";

let MAX_RETRIES = 5;



async function create_YoutubePlaylist(title, description) {
    
    const access_Token = get_YoutubeAccessToken()

    try{
        const response = await axios.post('https://www.googleapis.com/youtube/v3/playlists',
            {
              snippet: {
                title: title,
                description: description
              },
              status: {
                privacyStatus: 'public'
              }
            },
            {
              headers: {
                Authorization: `Bearer ${access_Token}`,
                'Content-Type': 'application/json'
              },
              params: {
                part: 'snippet,status'  // Include the parts you're modifying
              }
            }
          );
          console.log(response.data)
        }
        catch(error) {
            console.log('Error in creating YouTube Playlist', error.response ? error.response.data : error.response.message)
            throw(error)
        }
}

async function get_YoutubePlaylists() {

    const access_Token = await get_YoutubeAccessToken()
    
    try{
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlists', {
            headers: {
                Authorization: `Bearer ${access_Token}`,
            },
            params: {
                part: 'snippet,contentDetails',
                mine: true,
                maxResults: 25
        }
    });
    console.log(response.data)
    }
    catch(error) {
        console.log("Error in fetching YouTube Playlists", error.response ? error.response.data : error.response.message)
        throw(error)
    }
}

async function get_YoutubePlaylistItems(playlistId) {

    const youtubeAPI_KEY = process.env.YOUTUBE_API_KEY
    const access_Token = await get_YoutubeAccessToken()

    try{
        const response = axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
            headers: {
                Authorization: `Bearer ${access_Token}`
            },
            params: {
                part: 'snippet',
                playlistId: playlistId,
                key: youtubeAPI_KEY,
                maxResults: 50
            }
        })
    }
    catch(error) {
        console.log('Error while fetching Youtube Playlist Items', error.response ? error.response.data : error.response.message)
    }
}