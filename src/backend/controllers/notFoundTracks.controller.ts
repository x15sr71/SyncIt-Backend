import { Request, Response } from "express";
import { getNotFoundTracksFromSpotify } from "../services/getNotFoundTracks/spotifyNFT";
import { getNotFoundTracksFromYoutube } from "../services/getNotFoundTracks/youtubeNFT";

export const notFoundTracks = async (req, res) => {
  try {
    const userId = req.session?.userId;
    // const platform = (req.query.platform as string)?.toLowerCase(); // or use req.body.platform if POST
    const platform: string = "youtube";

    if (!userId || !platform) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or platform",
      });
    }

    switch (platform) {
      case "spotify": {
        const result = await getNotFoundTracksFromSpotify(userId);
        return res.json({ success: true, data: { spotify: result.data || [] } });
      }

      case "youtube": {
        const result = await getNotFoundTracksFromYoutube(userId);
        return res.json({ success: true, data: { youtube: result.data || [] } });
      }

      default:
        return res.status(400).json({
          success: false,
          message: "Unsupported platform",
        });
    }
  } catch (error) {
    console.error("Error in notFoundTracks controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while fetching not found tracks",
    });
  }
};
