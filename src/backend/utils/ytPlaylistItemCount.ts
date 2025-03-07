const axios = require("axios");
import { get_YoutubeAccessToken } from "../../OAuth/tokenManagement/youtubeTokensUtil";

let accessToken = '';

// Function to fetch access token
const fn = async () => {
  accessToken = await get_YoutubeAccessToken();
};

export const getPlaylistItemCount = async () => {
  await fn();
  console.log("OAuth Token: ", accessToken);

  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlists",
      {
        params: {
          part: "contentDetails",
          id: "PLY6KwKMkfULVfUn8i6MQP9i6XqKYdG-LK", // Replace with the actual playlist ID
        },
        headers: {
          Authorization: `Bearer ${accessToken}`, // Use OAuth token in the header
        },
      }
    );

    console.log("Playlist count response: ", response.data); // Log the response for debugging

    if (response.data.items && response.data.items.length > 0) {
      const itemCount = response.data.items[0].contentDetails.itemCount; // Access the itemCount
      console.log("Number of items in the playlist: ", itemCount);
      return itemCount;
    } else {
      console.log("Playlist not found or no items in the playlist.");
      return 0;
    }
  } catch (error) {
    console.error("Error fetching playlist count:", error.response?.data || error.message);
    return 0;
  }
};

// Example usage
const PLAYLIST_ID = "YOUR_PLAYLIST_ID"; // Replace with your playlist ID
