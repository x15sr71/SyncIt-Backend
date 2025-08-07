import { get_SpotifyAccessToken } from "../../../auth/spotify/spotifyTokenUtil";
import axios from "axios";

export const createSpotifyPlaylist = async (userId: string, playlistName: string): Promise<string> => {
  const accessToken = await get_SpotifyAccessToken(userId);
  const userRes = await axios.get("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const userSpotifyId = userRes.data.id;

  const playlistRes = await axios.post(
    `https://api.spotify.com/v1/users/${userSpotifyId}/playlists`,
    {
      name: playlistName,
      description: "Migrated from YouTube",
      public: true,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return playlistRes.data.id;
};
