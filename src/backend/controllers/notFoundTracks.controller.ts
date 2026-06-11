import { Request, Response } from 'express';
import { getNotFoundTracksFromSpotify } from '../services/getNotFoundTracks/spotifyNFT';
import { getNotFoundTracksFromYoutube } from '../services/getNotFoundTracks/youtubeNFT';

export const notFoundTracks = async (req: Request, res: Response) => {
  try {
    const userId = req.session?.id;
    const platform = ((req.query.platform as string) || (req.body.platform as string) || '').toLowerCase();

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!platform) {
      return res.status(400).json({
        success: false,
        message: 'Missing platform query param (spotify | youtube)',
      });
    }

    switch (platform) {
      case 'spotify': {
        const result = await getNotFoundTracksFromSpotify(userId);
        return res.json({
          success: true,
          data: { spotify: result.data || [] },
        });
      }

      case 'youtube': {
        const result = await getNotFoundTracksFromYoutube(userId);
        return res.json({
          success: true,
          data: { youtube: result.data || [] },
        });
      }

      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported platform',
        });
    }
  } catch (error: any) {
    console.error('Error in notFoundTracks controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching not found tracks',
    });
  }
};
