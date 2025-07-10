import prisma from "../db/index";
import axios from "axios";
import querystring from "querystring";

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = process.env.SPOTIFY_REDIRECT_URI;

export const handleSpotifyLogin = (req, res) => {
  const scope =
    "user-library-modify user-read-email user-read-private user-library-read playlist-read-private playlist-modify-private playlist-modify-public playlist-read-collaborative user-top-read user-read-recently-played";

  const authUrl = `https://accounts.spotify.com/authorize?${querystring.stringify(
    {
      response_type: "code",
      client_id,
      scope,
      redirect_uri,
      prompt: "consent",
    }
  )}`;

  return res.redirect(authUrl);
};

export const handleSpotifyCallback = async (req, res) => {
  const code = req.query.code || null;
  if (!code) {
    return res.status(400).json({ error: "Authorization code missing." });
  }

  const authHeader = `Basic ${Buffer.from(
    `${client_id}:${client_secret}`
  ).toString("base64")}`;

  try {
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        scope:
          "user-library-modify user-read-email user-read-private user-library-read playlist-read-private playlist-modify-private playlist-modify-public playlist-read-collaborative user-top-read user-read-recently-played", // 🔥 Ensure scope is explicitly passed
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: authHeader,
        },
      }
    );

    const { access_token, refresh_token, scope } = tokenResponse.data;

    // Debugging: Check if granted scope is correct
    console.log("Granted Scopes:", scope);

    // Fetch user's Spotify profile
    const profileResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, display_name, email, images } = profileResponse.data;
    const profile_picture = images && images.length ? images[0].url : "";

    const userId = req.session.id;

    if (!userId) {
      return res.status(401).json({
        error: "AUTH_ERROR",
        message: "User session not found. Please log in again.",
      });
    }

    // Check if Spotify data already exists
    const existingSpotifyData = await prisma.spotifyData.findFirst({
      where: { userId: userId },
    });

    if (existingSpotifyData) {
      await prisma.spotifyData.update({
        where: { id: existingSpotifyData.id },
        data: {
          spotify_user_id: id,
          username: display_name,
          picture: profile_picture,
          access_token: access_token,
          refresh_token: refresh_token || existingSpotifyData.refresh_token,
        },
      });
      console.log("Spotify data updated for user:", userId);
    } else {
      await prisma.spotifyData.create({
        data: {
          userId: userId,
          spotify_user_id: id,
          username: display_name,
          picture: profile_picture,
          access_token: access_token,
          refresh_token: refresh_token,
          createdAt: new Date(),
        },
      });
      console.log("Spotify data created for user:", userId);
      console.log("******************************");
      console.log("redirecting to sync page");
      console.log("******************************");
    }

    return res.status(200).json({
      status: "success",
      message: "Spotify login successful.",
      userId,
      spotify_user_id: id,
      username: display_name,
      picture: profile_picture,
    });
  } catch (error) {
    console.error(
      "Spotify OAuth Error:",
      error.response ? error.response.data : error.message
    );
    return res.status(400).json({
      error: "Spotify authentication failed.",
      details: error.response ? error.response.data : error.message,
    });
  }
};
