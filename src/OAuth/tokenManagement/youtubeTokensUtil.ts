import axios from 'axios';
import prisma from '../../db';
import querystring from 'querystring';

const client_id = process.env.YOUTUBE_CLIENT_ID;
const client_secret = process.env.YOUTUBE_CLIENT_SECRET;

export async function get_YoutubeAccessToken() {
    try {
      const access_token = await prisma.youTubeData.findMany({
        where: {
          username: "Chandragupt Singh"
        },
        select: {
          access_token: true
        }
      })

      return access_token[0].access_token;
  
      
    }
    catch(error) {
      console.log("Error in fetching access_token", error)
    }
  }

export async function refreshYoutubeAccessToken() {

  const {id, refresh_token} = await prisma.youTubeData.findFirst({
    where: {
      username: "Chandragupt Singh"
    },
    select: {
      id: true,
      refresh_token: true
    }
  })

    try {
      const requestBody = querystring.stringify({
        refresh_token: refresh_token,
        client_id,
        client_secret,
        grant_type: 'refresh_token'
    });

    // Make the POST request to the token endpoint
    const response = await axios.post("https://oauth2.googleapis.com/token", requestBody, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const { access_token, refresh_token: newRefreshToken } = response.data;

    await prisma.youTubeData.update({
      where: { 
        id: id
      },
      data: {
        access_token: access_token,
        // Update the refresh token only if a new one is returned
        refresh_token: newRefreshToken || refresh_token
      }
    });
    
    return true

  }
  catch(error)
  {
    console.log("Error in refreshing tokens", error)
    return false
  }
  
}