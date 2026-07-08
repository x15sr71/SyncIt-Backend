import axios from 'axios';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('axios');
jest.mock('../src/auth/spotify/spotifyTokenUtil', () => ({
  get_SpotifyAccessToken: jest.fn(),
  refreshSpotifyToken: jest.fn(),
}));

import { get_SpotifyAccessToken } from '../src/auth/spotify/spotifyTokenUtil';
import { getSpotifyPlaylistContent } from '../src/backend/services/getPlaylistContent/getSpotifyPlaylistContent';
import { deleteSongHandler } from '../src/backend/controllers/spotifyActions.controller';

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedRequest = axios.request as jest.MockedFunction<typeof axios.request>;
const mockedToken = get_SpotifyAccessToken as jest.MockedFunction<typeof get_SpotifyAccessToken>;

/**
 * Mock-level compliance assertions for the Feb-2026 Spotify API surface.
 * A regression to the removed paths (/tracks, body key `tracks`,
 * /users/{id}/playlists, limit 100) fails these tests.
 */
describe('Spotify endpoint compliance (Feb-2026 surface)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedToken.mockResolvedValue('sp-token');
  });

  it('getSpotifyPlaylistContent pages /items with limit 50 / stride 50 and fetches >100 tracks completely', async () => {
    const TOTAL = 120;
    mockedGet.mockImplementation(async (url: any, config: any) => {
      expect(String(url)).toBe('https://api.spotify.com/v1/playlists/PL1/items');
      expect(config.params.limit).toBe(50);
      const offset = config.params.offset;
      const count = Math.min(50, TOTAL - offset);
      return {
        data: {
          total: TOTAL,
          items: Array.from({ length: count }, (_, i) => ({
            track: {
              id: `t${offset + i}`,
              name: `Track ${offset + i}`,
              artists: [{ name: 'A' }],
              album: { name: 'Al', images: [] },
              duration_ms: 1000,
            },
          })),
        },
      } as any;
    });

    const tracks = await getSpotifyPlaylistContent('user-1', 'PL1');

    expect(tracks).toHaveLength(TOTAL);
    const offsets = mockedGet.mock.calls.map((c: any[]) => c[1].params.offset);
    expect(offsets).toEqual([0, 50, 100]);
    // No page skipped, no duplicate IDs
    expect(new Set(tracks.map((t) => t.id)).size).toBe(TOTAL);
  });

  it('deleteSongHandler removes via DELETE /playlists/{id}/items with body key `items`', async () => {
    mockedRequest.mockResolvedValue({ data: {} } as any);
    const req: any = {
      body: { playlistId: 'PL1', trackUri: 'spotify:track:x' },
      session: { id: 'user-1' },
    };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await deleteSongHandler(req, res);

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const call = mockedRequest.mock.calls[0][0] as any;
    expect(call.method).toBe('DELETE');
    expect(call.url).toBe('https://api.spotify.com/v1/playlists/PL1/items');
    expect(call.data).toEqual({ items: [{ uri: 'spotify:track:x' }] });
    expect(call.data).not.toHaveProperty('tracks');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
