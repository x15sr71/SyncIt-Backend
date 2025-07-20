import axios from "axios";
import prisma from "../../db";
import querystring from "querystring";

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const REQUEST_TIMEOUT = 10000; // 10 seconds for token requests

export async function get_SpotifyAccessToken(userId: string): Promise<string | null> {
  if (!userId || typeof userId !== 'string') {
    throw new Error("Invalid userId provided");
  }

  try {
    const spotifyData = await prisma.spotifyData.findFirst({
      where: { userId },
      select: { access_token: true },
    });

    if (!spotifyData?.access_token) {
      throw new Error("Access token not found or invalid");
    }

    return spotifyData.access_token;
  } catch (error) {
    console.error("Error in Spotify fetching access_token:", error.message);
    return null;
  }
}

export const refreshSpotifyToken = async (userId: string) => {
  if (!userId || typeof userId !== 'string') {
    throw new Error("Invalid userId provided");
  }

  if (!client_id || !client_secret) {
    throw new Error("Missing Spotify credentials in environment");
  }

  try {
    // Use transaction to prevent race conditions
    return await prisma.$transaction(async (tx) => {
      const spotifyData = await tx.spotifyData.findFirst({
        where: { userId },
        select: {
          id: true,
          refresh_token: true,
        },
      });

      if (!spotifyData) {
        throw new Error("Spotify data not found in the database");
      }

      const { id, refresh_token } = spotifyData;

      if (!refresh_token) {
        throw new Error("Refresh token not found");
      }

      const authHeader = `Basic ${Buffer.from(
        `${client_id}:${client_secret}`
      ).toString("base64")}`;

      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        querystring.stringify({
          grant_type: "refresh_token",
          refresh_token: refresh_token,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: authHeader,
          },
          timeout: REQUEST_TIMEOUT,
        }
      );

      if (!response.data || !response.data.access_token) {
        throw new Error("Invalid response from Spotify token endpoint");
      }

      const { access_token, refresh_token: newRefreshToken } = response.data;

      await tx.spotifyData.update({
        where: { id },
        data: {
          access_token: access_token,
          refresh_token: newRefreshToken || refresh_token,
        },
      });

      return { access_token };
    });
  } catch (error) {
    console.error("Error refreshing token:", error.message);
    
    // Provide more specific error information
    if (error.response) {
      const { status, data } = error.response;
      console.error(`Spotify token refresh failed with status ${status}:`, data);
      
      if (status === 400 && data?.error === 'invalid_grant') {
        throw new Error("Refresh token is invalid or expired. User needs to re-authenticate.");
      }
    }
    
    return null;
  }
};
