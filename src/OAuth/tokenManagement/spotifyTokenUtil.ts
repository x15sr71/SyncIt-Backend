import axios from 'axios';
import prisma from '../../db';
import querystring from 'querystring';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

export async function get_SpotifyAccessToken() {
    try {
      const access_token = await prisma.spotifyData.findMany({
        where: {
          username: "Chandragupt Singh"
        },
        select: {
          access_token: true
        }
      })
      //console.log(access_token)
      return access_token[0].access_token;
  
    }
    catch(error) {
      console.log("Error in Spotify fetching access_token", error)
    }
  }

  

  export const refreshSpotifyToken = async () => {

    const {id, refresh_token} = await prisma.spotifyData.findFirst({
        where: {
          username: "Chandragupt Singh"
        },
        select: {
          id: true,
          refresh_token: true
        }
      })
    const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`;

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader
            }
        });

        const { access_token, newRefreshToken} = response.data;

    await prisma.spotifyData.update({
      where: { 
        id: id
      },
      data: {
        access_token: access_token,
        // Update the refresh token only if a new one is returned
        refresh_token: newRefreshToken || refresh_token
      }
    });

        // Update the token in your storage or database
        // await updateTokenInDatabase(access_token, expires_in);

        return { access_token };
    } catch (error) {
        console.error('Error refreshing token:', error.response ? error.response.data : error.message);
        throw error;
    }
}