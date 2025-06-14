import axios from 'axios';
import prisma from '../../db';
import querystring from 'querystring';

const client_id = process.env.YOUTUBE_CLIENT_ID;
const client_secret = process.env.YOUTUBE_CLIENT_SECRET;

export async function get_YoutubeAccessToken(userId: string) {
    try {
        const accessTokenData = await prisma.youTubeData.findFirst({
            where: {
                userId: userId
            },
            select: {
                access_token: true
            }
        });

        if (!accessTokenData || !accessTokenData.access_token) {
            throw new Error('Access token not found');
        }

        return accessTokenData.access_token;
    } catch (error) {
        console.log("Error in fetching access_token", error);
        throw error;
    }
}

export async function refreshYoutubeAccessToken(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const tokenData = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { id: true, refresh_token: true }
    });

    if (!tokenData?.refresh_token) {
      return { success: false, error: 'no_refresh_token' };
    }

    const requestBody = querystring.stringify({
      refresh_token: tokenData.refresh_token,
      client_id,
      client_secret,
      grant_type: 'refresh_token'
    });

    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      requestBody,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token: newRefreshToken } = response.data;

    await prisma.youTubeData.update({
      where: { id: tokenData.id },
      data: {
        access_token,
        refresh_token: newRefreshToken || tokenData.refresh_token
      }
    });

    return { success: true };
  } catch (error: any) {
    const apiError = error.response?.data;
    console.error("Error refreshing YouTube token:", apiError || error.message);

    if (apiError?.error === 'invalid_grant') {
      return { success: false, error: 'invalid_grant' };
    }

    return { success: false, error: 'unknown_error' };
  }
}
