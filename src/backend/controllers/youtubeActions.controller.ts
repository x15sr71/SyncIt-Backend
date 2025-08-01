import axios from "axios";
import { get_YoutubeAccessToken } from "../../auth/youtube/youtubeTokensUtil";

const YT_API = "https://www.googleapis.com/youtube/v3";

export const renameYouTubePlaylistHandler = async (req, res) => {
  const { playlistId, newName } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId || !newName) {
    return res.status(400).json({ success: false, message: "Missing parameters." });
  }

  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    const updateRes = await axios.put(`${YT_API}/playlists?part=snippet`, {
      id: playlistId,
      snippet: {
        title: newName,
      },
    }, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return res.json({ success: true, message: "Playlist renamed successfully." });
  } catch (error) {
    console.error("Rename error:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Failed to rename playlist." });
  }
};

export const deleteYouTubePlaylistHandler = async (req, res) => {
  const { playlistId } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId) {
    return res.status(400).json({ success: false, message: "Missing playlist ID." });
  }

  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    await axios.delete(`${YT_API}/playlists`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        id: playlistId,
      },
    });

    return res.json({ success: true, message: "Playlist deleted successfully." });
  } catch (error) {
    console.error("Delete error:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: "Failed to delete playlist." });
  }
};

export const deleteYouTubeSongHandler = async (req, res) => {
  const { playlistId, videoId } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId || !videoId) {
    console.log("Missing parameters validation failed");
    return res.status(400).json({ success: false, message: "Missing parameters." });
  }

  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    // Step 1: Get the playlist item ID that matches the videoId

    const listRes = await axios.get(`${YT_API}/playlistItems`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        part: "id,snippet",
        playlistId,
        maxResults: 50,
      },
    });

    const items = listRes.data.items;
    
    // Debug: log all video IDs in the playlist
    items.forEach((item, index) => {
      console.log(`Item ${index}:`, {
        id: item.id,
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title
      });
    });

    const targetItem = items.find(
      item => item.snippet?.resourceId?.videoId === videoId
    );

    if (!targetItem) {
      console.log("Target item not found. Available video IDs:");
      items.forEach(item => {
        console.log("- ", item.snippet?.resourceId?.videoId);
      });
      return res.status(404).json({ success: false, message: "Video not found in playlist." });
    }

    console.log("Target item found:", {
      id: targetItem.id,
      videoId: targetItem.snippet?.resourceId?.videoId,
      title: targetItem.snippet?.title
    });

    console.log("Deleting playlist item with ID:", targetItem.id);
    await axios.delete(`${YT_API}/playlistItems`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { id: targetItem.id },
    });

    console.log("Delete successful!");
    return res.json({ success: true, message: "Video removed from playlist." });
    
  } catch (error) {
    console.error("=== ERROR IN DELETE SONG HANDLER ===");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error response:", error?.response?.data);
    console.error("Error status:", error?.response?.status);
    console.error("Full error:", error);
    
    return res.status(500).json({ 
      success: false, 
      message: "Failed to delete song.",
      error: error.message,
      details: error?.response?.data 
    });
  }
};
