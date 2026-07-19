import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { get_YoutubeAccessToken } from '../../auth/youtube/youtubeTokensUtil';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export const renameYouTubePlaylistHandler = async (req: Request, res: Response) => {
  const { playlistId, newName } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId || !newName) {
    return res.status(400).json({ success: false, message: 'Missing parameters.' });
  }

  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    const updateRes = await axios.put(
      `${YT_API}/playlists?part=snippet`,
      {
        id: playlistId,
        snippet: {
          title: newName,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return res.json({
      success: true,
      message: 'Playlist renamed successfully.',
    });
  } catch (error: any) {
    console.error('Rename error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to rename playlist.' });
  }
};

export const deleteYouTubePlaylistHandler = async (req: Request, res: Response) => {
  const { playlistId } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId) {
    return res.status(400).json({ success: false, message: 'Missing playlist ID.' });
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

    return res.json({
      success: true,
      message: 'Playlist deleted successfully.',
    });
  } catch (error: any) {
    console.error('Delete error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete playlist.' });
  }
};

export const deleteYouTubeSongHandler = async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId || !videoId) {
    console.log('Missing parameters validation failed');
    return res.status(400).json({ success: false, message: 'Missing parameters.' });
  }

  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    // Step 1: Find the playlist item matching the videoId, paginating past
    // the first 50 — songs beyond position 50 were "not found" (P2-2).
    let targetItem: any = null;
    let pageToken: string | undefined;
    do {
      const listRes: any = await axios.get(`${YT_API}/playlistItems`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          part: 'id,snippet',
          playlistId,
          maxResults: 50,
          ...(pageToken ? { pageToken } : {}),
        },
      });

      targetItem = (listRes.data.items || []).find(
        (item: any) => item.snippet?.resourceId?.videoId === videoId,
      );
      pageToken = listRes.data.nextPageToken;
    } while (!targetItem && pageToken);

    if (!targetItem) {
      return res.status(404).json({ success: false, message: 'Video not found in playlist.' });
    }

    console.log('Target item found:', {
      id: targetItem.id,
      videoId: targetItem.snippet?.resourceId?.videoId,
      title: targetItem.snippet?.title,
    });

    console.log('Deleting playlist item with ID:', targetItem.id);
    await axios.delete(`${YT_API}/playlistItems`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { id: targetItem.id },
    });

    console.log('Delete successful!');
    return res.json({ success: true, message: 'Video removed from playlist.' });
  } catch (error: any) {
    console.error('=== ERROR IN DELETE SONG HANDLER ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error response:', error?.response?.data);
    console.error('Error status:', error?.response?.status);
    console.error('Full error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to delete song.',
      error: error.message,
      details: error?.response?.data,
    });
  }
};
