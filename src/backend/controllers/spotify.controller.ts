import { Request, Response } from 'express';

/**
 * GET /spotifyTracks — liked-songs fetch.
 *
 * The Spotify Feb-2026 API update removed GET /me/tracks, which this
 * feature was built on. Until it is rebuilt on the new library
 * semantics (GET /me/library), respond 501 like the delete-playlist
 * action does. TODO(owner): rebuild on /me/library or drop the feature.
 */
export const searchSpotifyTracks = async (_req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message:
      'Liked-songs sync is unavailable: Spotify removed the /me/tracks API in February 2026.',
  });
};
