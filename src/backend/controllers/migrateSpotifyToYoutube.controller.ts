import { Request, Response } from "express";
import { migrateSpotifyPlaylistToYoutube } from "../services/migration/spotifyToYoutube";

export async function migrateSpotifyToYoutubeHandler(req, res) {
  const userId = req.session?.id as string;
  // const { spotifyPlaylistId, youtubePlaylistId } = req.body;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Unauthorized: Missing user session"
    });
  }
  // if (!spotifyPlaylistId || !youtubePlaylistId) {
  //   return res.status(400).json({ error: "spotifyPlaylistId and youtubePlaylistId are required" });
  // }

  try {
    const result = await migrateSpotifyPlaylistToYoutube(
      userId,
      "PLY6KwKMkfULW2bGdfKhzHa8mEf9joJwXK",
      "0QmChKbZIAl4P0P1sTSbF2"
    );
    return res.json(result);
  } catch (err: any) {
    console.error("Migration error:", err);
    return res.status(err?.statusCode || 500).json(err);
  }
}
