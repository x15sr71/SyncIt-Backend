import axios from 'axios';
import prisma from '../../db';
import querystring from 'querystring';

const client_id = process.env.YOUTUBE_CLIENT_ID;
const client_secret = process.env.YOUTUBE_CLIENT_SECRET;
const REQUEST_TIMEOUT = 10000; // 10 seconds

export async function get_YoutubeAccessToken(userId: string): Promise<string | null> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  try {
    const accessTokenData = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { access_token: true }
    });

    if (!accessTokenData?.access_token) {
      throw new Error('Access token not found');
    }

    return accessTokenData.access_token;
  } catch (error) {
    console.error("Error in fetching YouTube access_token:", error);
    return null;
  }
}

export async function refreshYoutubeAccessToken(userId: string): Promise<{
  success: boolean;
  newAccessToken?: string;
  error?: string;
}> {
  if (!userId || typeof userId !== 'string') {
    return { success: false, error: 'invalid_user_id' };
  }

  if (!client_id || !client_secret) {
    console.error('Missing YouTube OAuth credentials in environment');
    return { success: false, error: 'missing_credentials' };
  }

  try {
    // Use transaction to prevent race conditions
    return await prisma.$transaction(async (tx) => {
      const tokenData = await tx.youTubeData.findFirst({
        where: { userId },
        select: { id: true, refresh_token: true }
      });

      if (!tokenData) {
        return { success: false, error: 'user_not_found' };
      }

      if (!tokenData.refresh_token) {
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
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: REQUEST_TIMEOUT
        }
      );

      if (!response.data?.access_token) {
        return { success: false, error: 'invalid_response' };
      }

      const { access_token, refresh_token: newRefreshToken } = response.data;

      await tx.youTubeData.update({
        where: { id: tokenData.id },
        data: {
          access_token,
          refresh_token: newRefreshToken || tokenData.refresh_token
        }
      });

      return { success: true, newAccessToken: access_token };
    });

  } catch (error: any) {
    const apiError = error.response?.data;
    console.error("Error refreshing YouTube token:", apiError || error.message);

    if (apiError?.error === 'invalid_grant') {
      return { success: false, error: 'invalid_grant' };
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return { success: false, error: 'timeout' };
    }

    return { success: false, error: 'unknown_error' };
  }
}
