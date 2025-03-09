import prisma from "../db/index";
import axios from "axios";
import querystring from "querystring";
import dotenv from "dotenv";
import redis from "../config/redis";

dotenv.config();

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

export const handleGoogleLogin = (req, res) => {
  const scope = ["profile", "email"].join(" ");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify(
    {
      client_id,
      redirect_uri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
    }
  )}`;
  return res.redirect(authUrl);
};

export const handleGoogleCallback = async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.status(400).json({ error: "Authorization code missing." });
  }

  try {
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

    const profileResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const { name, picture, email } = profileResponse.data;

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
      user = await prisma.user.update({
        where: { email },
        data: { access_token },
      });
    }

    console.log(user);
    const session = await prisma.$transaction(async (tx) => {
      // 1️⃣ Delete previous sessions of the user
      await tx.session.deleteMany({
        where: { user_id: user.id },
      });

      // 2️⃣ Create a new session
      return await tx.session.create({
        data: { user_id: user.id },
      });
    });

    console.log(session.session_id);

    // 3️⃣ Remove previous Redis session(s)
    const previousSessionKeys = await redis.keys(`session:*`); // Get all session keys
    for (const key of previousSessionKeys) {
      const sessionData = await redis.get(key);
      if (sessionData && JSON.parse(sessionData).id === user.id) {
        await redis.del(key); // Delete the old session
      }
    }

    // 4️⃣ Store the new session in Redis
    await redis.setex(
      `session:${session.session_id}`,
      parseInt(process.env.SESSION_TTL || "86400"), // Default 1 day TTL
      JSON.stringify({ id: user.id, email: user.email })
    );

    const userId = await redis.get(`session:${session.session_id}`);
    console.log("User ID: ", userId);

    res.cookie("sessionId", session.session_id, {
      httpOnly: true, // Prevents JavaScript access (security)
      secure: true, // HTTPS only in production
      sameSite: "None", // Prevents CSRF attacks
      maxAge: 86400000, // 1 day expiration
    });

    return res.json({
      message: "Google login successful",
      userId: user.id,
      sessionId: session.session_id,
      access_token,
      refresh_token,
    });
  } catch (error) {
    return res.status(400).json({
      error: "Google authentication failed.",
      details: error.response?.data || error.message,
    });
  }
};
