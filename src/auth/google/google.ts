import prisma from "../../db/prisma";
import axios from "axios";
import crypto from "crypto";
import querystring from "querystring";
import dotenv from "dotenv";
import redis from "../../config/redis";
import {
  generateOAuthState,
  validateOAuthState,
  buildRedirectUrl,
} from "../oauthState";

dotenv.config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

export const handleGoogleLogin = async (req, res) => {
  const sessionId = req.cookies?.sessionId;

  if (sessionId) {
    const sessionData = await redis.get(`session:${sessionId}`);
    if (sessionData) {
      return res.redirect(buildRedirectUrl("/dashboard"));
    }
  }

  // Accept optional redirect_after from query params
  const redirectAfter =
    (req.query.redirect_after as string) || "/dashboard";

  // For pre-login flow: generate a temporary browser-binding cookie
  // since the user has no authenticated session yet
  const tempNonce = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_temp", tempNonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 1000 * 60 * 10, // 10 minutes, matches state TTL
  });

  const state = await generateOAuthState("login", {
    sessionId: tempNonce,
    redirectAfter,
  });

  const scope = ["openid", "profile", "email"].join(" ");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify({
    client_id,
    redirect_uri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
  })}`;
  return res.redirect(authUrl);
};

export const handleGoogleCallback = async (req, res) => {
  const code = req.query.code || null;
  const stateParam = req.query.state as string | undefined;

  // Validate state before doing anything else
  const stateData = await validateOAuthState(stateParam);
  if (!stateData || stateData.flow !== "login") {
    return res.status(400).json({
      error: "Invalid or missing OAuth state. Possible CSRF attempt.",
    });
  }

  // Session binding: verify the browser that started login is the one completing it.
  // For login flow, stateData.sessionId holds the oauth_temp nonce set before redirect.
  const tempCookie = req.cookies?.oauth_temp;
  if (stateData.sessionId && stateData.sessionId !== tempCookie) {
    return res.status(403).json({
      error: "Session mismatch - possible CSRF attempt",
    });
  }

  // Clear the temporary OAuth cookie now that it's been validated
  res.clearCookie("oauth_temp", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  });

  console.log(`OAuth ${stateData.flow} callback initiated`);

  if (!code) {
    return res.status(400).json({ error: "Authorization code missing." });
  }

  try {
    // Check for existing valid session
    const existingSessionId = req.cookies?.sessionId;
    if (existingSessionId) {
      const existingSessionData = await redis.get(`session:${existingSessionId}`);
      if (existingSessionData) {
        return res.redirect(buildRedirectUrl(stateData.redirectAfter));
      }
    }

    // Exchange code for access & refresh tokens
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      querystring.stringify({
        code,
        client_id,
        client_secret,
        redirect_uri,
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    // Get user profile
    const profileResponse = await axios.get("https://www.googleapis.com/oauth2/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { name, picture, email } = profileResponse.data;

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          username: name,
          profilePicture: picture,
          access_token,
          refresh_token: refresh_token || null,
          keepInSync: true,
          primaryService: null,
          lastSyncTime: null,
          lastSyncTracks: null,
        },
      });
    } else {
      await prisma.user.update({
        where: { email },
        data: { access_token },
      });
    }

    console.log("created:", user.id);

    // Delete previous session & create a new one
    const session = await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { user_id: user.id } });
      return await tx.session.create({ data: { user_id: user.id } });
    });

    console.log("New session ID:", session.session_id);

    // Remove old Redis session (Only user's session)
    await redis.del(`session:${user.id}`);

    // Store session in Redis
    await redis.setex(
      `session:${session.session_id}`,
      parseInt(process.env.SESSION_TTL || "86400"), // Default 1 day TTL
      JSON.stringify({ id: user.id, email: user.email })
    );

    // Set session cookie securely
    res.cookie("sessionId", session.session_id, {
      httpOnly: true,
      secure: false, // Secure only in production
      sameSite: "Lax",
      maxAge: 1000 * 60 * 60 * 24 * 60, // 60 days expiration
    });

    // Redirect to frontend using the redirectAfter from state
    return res.redirect(buildRedirectUrl(stateData.redirectAfter));
  } catch (error) {
    return res.status(400).json({
      error: "Google authentication failed.",
      details: error.response?.data || error.message,
    });
  }
};