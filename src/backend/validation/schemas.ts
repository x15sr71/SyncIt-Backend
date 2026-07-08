import { z } from 'zod';

// Shape-level validation: length caps and charset, not exact platform
// formats (Spotify IDs are 22 chars, YouTube playlists vary, 'LL' is 2).
export const platformId = z.string().regex(/^[A-Za-z0-9_-]{2,64}$/, 'invalid platform id');

const playlistName = z.string().trim().min(1).max(100);

// Bounded fan-out: each ID triggers upstream fetch chains, so cap the batch
// (a 10,000-element array previously meant 10,000 parallel upstreams).
export const playlistIdsBody = z.object({
  playlistIds: z.array(platformId).min(1).max(10),
});

export const intervalMinutes = z.number().int().min(10).max(10080);

export const spotifyRenameBody = z.object({
  playlistId: platformId,
  newName: playlistName,
});

export const spotifyDeletePlaylistBody = z.object({
  playlistId: platformId,
});

export const spotifyDeleteSongBody = z.object({
  playlistId: platformId,
  trackUri: z.string().regex(/^(spotify:track:)?[A-Za-z0-9]{22}$/, 'invalid track URI'),
});

export const youtubeRenameBody = spotifyRenameBody;

export const youtubeDeletePlaylistBody = spotifyDeletePlaylistBody;

export const youtubeDeleteSongBody = z.object({
  playlistId: platformId,
  videoId: z.string().regex(/^[A-Za-z0-9_-]{5,20}$/, 'invalid video id'),
});

export const emptyYoutubePlaylistBody = z.object({
  playlistId: platformId,
});

export const migrateSpotifyToYoutubeBody = z.object({
  spotifyPlaylistId: platformId,
  youtubePlaylistId: platformId.optional(),
  playlistName: playlistName.optional(),
  // The client sends the target name under this key.
  youtubePlaylistName: playlistName.optional(),
});

export const migrateYoutubeToSpotifyBody = z.object({
  playlistId: platformId,
  playlistName,
});

const syncPlatform = z.enum(['SPOTIFY', 'YOUTUBE']);

export const autoSyncTargetBody = z.object({
  playlistId: platformId,
  sourcePlatform: syncPlatform,
  destinationPlatform: syncPlatform,
});

export const autoSyncEnableBody = autoSyncTargetBody.extend({
  intervalMinutes: intervalMinutes.optional(),
});

export const autoSyncUpdateIntervalBody = autoSyncTargetBody.extend({
  intervalMinutes,
});

export const notFoundTracksQuery = z.object({
  platform: z.enum(['spotify', 'youtube']).optional(),
});
