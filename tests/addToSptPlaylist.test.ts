import axios from 'axios';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('axios');
jest.mock('../src/auth/spotify/spotifyTokenUtil', () => ({
  get_SpotifyAccessToken: jest.fn(),
  refreshSpotifyToken: jest.fn(),
}));

import { get_SpotifyAccessToken } from '../src/auth/spotify/spotifyTokenUtil';
import { addToSptPlaylist } from '../src/backend/services/addTo/addToSptPlaylist';

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;
const mockedToken = get_SpotifyAccessToken as jest.MockedFunction<typeof get_SpotifyAccessToken>;

const id = (n: number) => n.toString().padStart(22, '0'); // valid 22-char IDs

/** Mock the paginated GET /playlists/{id}/items destination-content fetch. */
function mockExistingItems(existingIds: string[]) {
  mockedGet.mockImplementation(async (_url: any, config: any) => {
    const offset = config?.params?.offset ?? 0;
    const limit = config?.params?.limit ?? 50;
    return {
      data: {
        total: existingIds.length,
        items: existingIds.slice(offset, offset + limit).map((t) => ({ track: { id: t } })),
      },
    } as any;
  });
}

describe('addToSptPlaylist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedToken.mockResolvedValue('sp-token');
  });

  it('adds in batches of <=100 to the /items endpoint and returns added IDs', async () => {
    const trackIds = Array.from({ length: 150 }, (_, i) => id(i));
    mockExistingItems([]);
    mockedPost.mockResolvedValue({ data: { snapshot_id: 'snap' } } as any);

    const result = await addToSptPlaylist(trackIds, 'user-1', 'My List', 'PLAYLIST_ID');

    expect(mockedPost).toHaveBeenCalledTimes(2);
    const [url1, body1] = mockedPost.mock.calls[0] as any[];
    const [, body2] = mockedPost.mock.calls[1] as any[];
    expect(url1).toBe('https://api.spotify.com/v1/playlists/PLAYLIST_ID/items');
    expect(body1.uris).toHaveLength(100);
    expect(body2.uris).toHaveLength(50);
    expect(body1.uris[0]).toBe(`spotify:track:${id(0)}`);
    expect(result.addedTrackIds).toHaveLength(150);
    expect(result.failedTrackIds).toHaveLength(0);
    expect(result.playlistId).toBe('PLAYLIST_ID');
  });

  it('dedupes against destination content and skips already-present tracks', async () => {
    const trackIds = [id(1), id(2), id(3)];
    mockExistingItems([id(2)]);
    mockedPost.mockResolvedValue({ data: {} } as any);

    const result = await addToSptPlaylist(trackIds, 'user-1', 'My List', 'PLAYLIST_ID');

    expect(result.alreadyPresentTrackIds).toEqual([id(2)]);
    expect(result.addedTrackIds).toEqual([id(1), id(3)]);
    const [, body] = mockedPost.mock.calls[0] as any[];
    expect(body.uris).toEqual([`spotify:track:${id(1)}`, `spotify:track:${id(3)}`]);
  });

  it('throws when no tracks could be added at all', async () => {
    mockExistingItems([]);
    mockedPost.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));

    await expect(
      addToSptPlaylist([id(1), id(2)], 'user-1', 'My List', 'PLAYLIST_ID'),
    ).rejects.toThrow(/no tracks could be added/i);
  });

  it('reports failed batches without discarding successful ones', async () => {
    const trackIds = Array.from({ length: 150 }, (_, i) => id(i));
    mockExistingItems([]);
    mockedPost
      .mockResolvedValueOnce({ data: {} } as any) // batch 1 (100) ok
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { response: { status: 500 } }));

    const result = await addToSptPlaylist(trackIds, 'user-1', 'My List', 'PLAYLIST_ID');

    expect(result.addedTrackIds).toHaveLength(100);
    expect(result.failedTrackIds).toHaveLength(50);
  });

  it('filters invalid IDs and returns early when nothing valid remains', async () => {
    const result = await addToSptPlaylist(['short', ''], 'user-1', 'My List', 'PLAYLIST_ID');

    expect(result).toEqual({
      playlistId: 'PLAYLIST_ID',
      addedTrackIds: [],
      alreadyPresentTrackIds: [],
      failedTrackIds: [],
    });
    expect(mockedPost).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('creates the playlist via POST /me/playlists when name lookup finds nothing', async () => {
    mockedGet.mockImplementation(async (url: any, config: any) => {
      if (String(url).includes('/me/playlists')) {
        return { data: { items: [] } } as any; // no playlist with that name
      }
      // destination items fetch after creation
      return { data: { total: 0, items: [] } } as any;
    });
    mockedPost.mockImplementation(async (url: any) => {
      if (String(url) === 'https://api.spotify.com/v1/me/playlists') {
        return { data: { id: 'NEW_PLAYLIST' } } as any;
      }
      return { data: {} } as any;
    });

    const result = await addToSptPlaylist([id(1)], 'user-1', 'Fresh List');

    expect(result.playlistId).toBe('NEW_PLAYLIST');
    const createCall = mockedPost.mock.calls.find(
      (c: any[]) => c[0] === 'https://api.spotify.com/v1/me/playlists',
    ) as any[];
    expect(createCall[1].name).toBe('Fresh List');
    // And the add itself went to the new /items path
    const addCall = mockedPost.mock.calls.find((c: any[]) =>
      String(c[0]).includes('/playlists/NEW_PLAYLIST/items'),
    );
    expect(addCall).toBeTruthy();
  });
});
