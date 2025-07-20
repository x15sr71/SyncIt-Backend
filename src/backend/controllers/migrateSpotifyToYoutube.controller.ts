// src/controllers/migrateSpotifyToYoutube.controller.ts
import { Request, Response } from "express";
import { migrateSpotifyPlaylistToYoutube } from "../services/migration/spotifyToYoutube";

/**
 * Controller/handler to migrate a Spotify playlist to YouTube.
 * Expects JSON body: { spotifyPlaylistId: string, youtubePlaylistId: string }
 */
export async function migrateSpotifyToYoutubeHandler(req, res) {
  try {
    const userId = req.session?.id as string;
    // const { spotifyPlaylistId, youtubePlaylistId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: Missing user session" });
    }
    // if (!spotifyPlaylistId || !youtubePlaylistId) {
    //   return res.status(400).json({ error: "spotifyPlaylistId and youtubePlaylistId are required" });
    // }

    const result = await migrateSpotifyPlaylistToYoutube(
      userId,
      "PLY6KwKMkfULW2bGdfKhzHa8mEf9joJwXK",
      "3ogemKEe33j0shVnqjTliY"
    );

    return res.json(result);
  } catch (err: any) {
    console.error("Migration error:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
