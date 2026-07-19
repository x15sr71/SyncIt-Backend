import { Request, Response } from 'express';

/**
 * Empty-liked-songs action.
 *
 * The Spotify Feb-2026 API update removed GET/DELETE /me/tracks, which
 * this feature was built on. Until it is rebuilt on the new library
 * semantics (DELETE /me/library), respond 501 like the delete-playlist
 * action does. TODO(owner): rebuild on /me/library or drop the feature.
 */
export const emptySpotifyPlaylist = async (_req: Request, res: Response) => {
  return res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message:
      'Emptying liked songs is unavailable: Spotify removed the /me/tracks API in February 2026.',
  });
};
