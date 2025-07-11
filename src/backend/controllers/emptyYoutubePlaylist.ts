// src/controllers/youtube.controller.ts
import { clearYouTubePlaylist } from "../services/emptyPlaylist/emptyYoutubePlaylist";

export const emptyYouTubePlaylist = async (req, res) => {
  const userId = req.session?.id;
//   const { playlistId } = req.body;

//   if (!userId || !playlistId) {
//     return res.status(400).json({
//       success: false,
//       error: "MISSING_PARAMS",
//       message: "User session or playlistId missing.",
//     });
//   }

  try {
    const result = await clearYouTubePlaylist(userId, "PLY6KwKMkfULW2bGdfKhzHa8mEf9joJwXK");
    return res.json(result);
  } catch (error) {
    console.error("Error clearing YouTube playlist:", error.message);
    return res.status(500).json({
      success: false,
      error: "YT_CLEAR_FAILED",
      message: error.message,
    });
  }
};
