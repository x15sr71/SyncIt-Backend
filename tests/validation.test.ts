import { describe, it, expect, jest } from '@jest/globals';
import { validate } from '../src/middlewares/validate';
import {
  playlistIdsBody,
  autoSyncUpdateIntervalBody,
  migrateYoutubeToSpotifyBody,
  spotifyDeleteSongBody,
} from '../src/backend/validation/schemas';

function run(middleware: any, body: any, query?: any) {
  const req: any = { body, query: query ?? {} };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  middleware(req, res, next);
  return { req, res, next };
}

describe('zod request validation (P1-9)', () => {
  it('rejects an oversized playlistIds array with 400', () => {
    const { res, next } = run(validate({ body: playlistIdsBody }), {
      playlistIds: Array.from({ length: 10000 }, (_, i) => `playlist_${i}`),
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0] as any;
    expect(payload.error).toBe('VALIDATION_ERROR');
  });

  it('accepts a small valid playlistIds array', () => {
    const { next, res } = run(validate({ body: playlistIdsBody }), {
      playlistIds: ['37i9dQZF1DXcBWIGoYBM5M'],
    });

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a bad intervalMinutes (too small, non-integer, too large)', () => {
    for (const intervalMinutes of [5, 10.5, 999999, '60' as any]) {
      const { res, next } = run(validate({ body: autoSyncUpdateIntervalBody }), {
        playlistId: 'PLabc123456',
        sourcePlatform: 'YOUTUBE',
        destinationPlatform: 'SPOTIFY',
        intervalMinutes,
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('rejects playlist IDs with invalid characters or absurd length', () => {
    for (const playlistId of ['a b c', 'x'.repeat(65), '<script>', '']) {
      const { res, next } = run(validate({ body: migrateYoutubeToSpotifyBody }), {
        playlistId,
        playlistName: 'My Playlist',
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('strips unknown body keys so handlers only see the contract', () => {
    const { req, next } = run(validate({ body: migrateYoutubeToSpotifyBody }), {
      playlistId: 'PLabc123456',
      playlistName: 'My Playlist',
      __proto__pollution: 'x',
      admin: true,
    });

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ playlistId: 'PLabc123456', playlistName: 'My Playlist' });
  });

  it('validates spotify track URIs', () => {
    const ok = run(validate({ body: spotifyDeleteSongBody }), {
      playlistId: '37i9dQZF1DXcBWIGoYBM5M',
      trackUri: 'spotify:track:' + 'a'.repeat(22),
    });
    expect(ok.next).toHaveBeenCalled();

    const bad = run(validate({ body: spotifyDeleteSongBody }), {
      playlistId: '37i9dQZF1DXcBWIGoYBM5M',
      trackUri: 'javascript:alert(1)',
    });
    expect(bad.res.status).toHaveBeenCalledWith(400);
  });
});
