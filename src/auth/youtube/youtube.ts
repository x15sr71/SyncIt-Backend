import prisma from "../../db/prisma";
import axios from "axios";
import querystring from "querystring";
import {
  generateOAuthState,
  validateOAuthState,
  buildRedirectUrl,
} from "../oauthState";

// Reuse the same Google OAuth client credentials
const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.YOUTUBE_REDIRECT_URI;

export const handleYouTubeLogin = async (req, res) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in first.",
    });
  }

  // Accept optional redirect_after from query params
  const redirectAfter =
    (req.query.redirect_after as string) || "/dashboard";

  const state = await generateOAuthState("youtube_connect", {
    userId,
    sessionId: req.cookies?.sessionId,
    redirectAfter,
  });

  // Scopes: identity scopes + YouTube CRUD
  // youtube scope covers all methods used: playlists.insert/update/delete,
  // playlistItems.list/insert/delete, playlists.list
  const scope = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/youtube",
  ].join(" ");

  // Construct the Google OAuth2 URL using the shared Google client
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify(
    {
      response_type: "code",
      client_id,
      scope,
      redirect_uri,
      access_type: "offline",
      prompt: "consent", // Ensures Google always returns a refresh token
      include_granted_scopes: "true", // Incremental authorization
      state,
    }
  )}`;

  // Redirect user to the Google OAuth2 login page
  res.redirect(authUrl);
};

export const handleYouTubeCallback = async (req, res) => {
  const code = req.query.code || null;
  const stateParam = req.query.state as string | undefined;

  // Validate state before doing anything else
  const stateData = await validateOAuthState(stateParam);
  if (!stateData || stateData.flow !== "youtube_connect") {
    return res.status(400).json({
      error: "Invalid or missing OAuth state. Possible CSRF attempt.",
    });
  }

  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  // Verify the state's userId matches the current session user
  if (stateData.userId && stateData.userId !== userId) {
    return res.status(403).json({
      error: "AUTH_ERROR",
      message: "Session user does not match OAuth state. Possible account mismatch.",
    });
  }

  // Session binding: if state was created with a session, verify it matches
  if (stateData.sessionId && stateData.sessionId !== req.cookies?.sessionId) {
    return res.status(403).json({
      error: "Session mismatch - possible CSRF attempt",
    });
  }

  console.log(`OAuth ${stateData.flow} completed for user ${stateData.userId}`);

  if (!code) {
    return res.status(400).json({ error: "Authorization code missing." });
  }

  try {
    console.log("Received YouTube connect auth code for user:", userId);

    // Exchange authorization code for access token using shared Google client
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      querystring.stringify({
        code,
        client_id,
        client_secret,
        redirect_uri,
        grant_type: "authorization_code",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token } = response.data;

    // Fetch user profile data
    const profileResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const { id: googleUserId, name, picture, email } = profileResponse.data;

    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      console.log("User not found, redirecting to login page");
      return res.status(401).json({
        error: "AUTH_ERROR",
        message: "User session not found. Please log in again.",
      });
    }

    console.log("Existing user:", user.id, user.email);

    const existingYouTubeData = await prisma.youTubeData.findFirst({
      where: { userId: user.id },
    });

    if (existingYouTubeData) {
      console.log("Updating existing YouTube tokens...");
      await prisma.youTubeData.update({
        where: { id: existingYouTubeData.id },
        data: {
          access_token: access_token,
          // Only overwrite refresh_token if a new one was provided
          refresh_token: refresh_token || existingYouTubeData.refresh_token,
          last_SyncedAt: new Date(),
        },
      });
    } else {
      // Guard: refresh_token is required by schema (non-nullable String)
      if (!refresh_token) {
        console.error("No refresh_token returned by Google on initial YouTube connect");
        return res.status(400).json({
          error: "MISSING_REFRESH_TOKEN",
          message:
            "Google did not provide a refresh token. Please try connecting YouTube again.",
        });
      }

      console.log("Creating new YouTube data entry...");
      await prisma.youTubeData.create({
        data: {
          userId: user.id,
          youtube_user_id: googleUserId, // Fix: was missing, required by schema
          username: name,
          picture: picture,
          access_token: access_token,
          refresh_token: refresh_token,
          createdAt: new Date(),
        },
      });
    }

    // Redirect user to the frontend page specified in OAuth state
    return res.redirect(buildRedirectUrl(stateData.redirectAfter));
  } catch (error) {
    console.error("YouTube OAuth Error:", error.response?.data || error.message);
    return res.status(400).json({
      error: "YouTube authentication failed.",
      details: error.response?.data || error.message,
    });
  }
};
