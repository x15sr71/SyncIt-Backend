import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    youTubeData: { findFirst: jest.fn(), update: jest.fn() },
    playlistMigration: { findFirst: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock('../src/backend/services/getPlaylistContent/getSpotifyPlaylistContent', () => ({
  getSpotifyPlaylistContent: jest.fn(),
}));
jest.mock('../src/backend/services/search/searchYoutube/searchYoutube', () => ({
  searchTracksOnYoutubeService: jest.fn(),
}));
jest.mock('../src/backend/openAI/getBestMatch', () => ({
  callLlmJsonWithRetry: jest.fn(),
}));
jest.mock('../src/backend/services/addTo/addToYoutube', () => ({
  addToYoutubePlaylist: jest.fn(),
  fetchExistingVideoIds: jest.fn(),
}));
jest.mock('../src/auth/youtube/youtubeTokensUtil', () => ({
  get_YoutubeAccessToken: jest.fn(),
  refreshYoutubeAccessToken: jest.fn(),
}));

import prisma from '../src/db/prisma';
import { getSpotifyPlaylistContent } from '../src/backend/services/getPlaylistContent/getSpotifyPlaylistContent';
import { searchTracksOnYoutubeService } from '../src/backend/services/search/searchYoutube/searchYoutube';
import { callLlmJsonWithRetry } from '../src/backend/openAI/getBestMatch';
import {
  addToYoutubePlaylist,
  fetchExistingVideoIds,
} from '../src/backend/services/addTo/addToYoutube';
import { get_YoutubeAccessToken } from '../src/auth/youtube/youtubeTokensUtil';
import { migrateSpotifyPlaylistToYoutube } from '../src/backend/services/migration/spotifyToYoutube';

const mockPrisma = prisma as any;
const mockContent = getSpotifyPlaylistContent as jest.Mock<any>;
const mockSearch = searchTracksOnYoutubeService as jest.Mock<any>;
const mockLlm = callLlmJsonWithRetry as jest.Mock<any>;
const mockAdd = addToYoutubePlaylist as jest.Mock<any>;
const mockExisting = fetchExistingVideoIds as jest.Mock<any>;
const mockToken = get_YoutubeAccessToken as jest.Mock<any>;

const spTrack = (n: number) => ({
  id: `spTrack${n}`,
  name: `Song ${n}`,
  artists: [`Artist ${n}`],
  album: `Album ${n}`,
  duration_ms: 180000,
  image_url: null,
});

const ytSearchResult = (n: number) => ({
  trackName: `Song ${n}`,
  query: `Song ${n}`,
  results: [
    {
      id: { videoId: `video${n}` },
      snippet: {
        title: `Song ${n} video`,
        channelTitle: `Channel ${n}`,
        publishedAt: '2024-01-01T00:00:00Z',
      },
    },
  ],
});

describe('migrateSpotifyPlaylistToYoutube (P1-8 ledger integrity)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.youTubeData.findFirst.mockResolvedValue({ id: 'ytdata-1' });
    mockPrisma.youTubeData.update.mockResolvedValue({});
    mockPrisma.playlistMigration.findFirst.mockResolvedValue({ sourceTrackIds: [] });
    mockPrisma.playlistMigration.upsert.mockResolvedValue({});
    mockToken.mockResolvedValue('yt-token');
    mockExisting.mockResolvedValue(new Set());
    mockContent.mockResolvedValue([spTrack(1), spTrack(2), spTrack(3)]);
    mockSearch.mockResolvedValue([ytSearchResult(1), ytSearchResult(2), ytSearchResult(3)]);
    mockLlm.mockResolvedValue({ '1': 1, '2': 1, '3': 1 });
  });

  it('records only actually-added source track IDs; per-video failures stay retryable', async () => {
    // video2's insert failed inside addToYoutubePlaylist
    mockAdd.mockResolvedValue(['video1', 'video3']);

    const result = await migrateSpotifyPlaylistToYoutube('user-1', 'SP_PL', 'YT_DEST');

    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.sourceTrackIds).toEqual(['spTrack1', 'spTrack3']);
    expect(upsert.update.lastSyncStatus).toBe('PARTIAL');
    expect(result.success).toBe(false);
    expect(result.failedDetails.join(' ')).toContain('Song 2');
    expect(result.videoIds).toEqual(['video1', 'video3']);
  });

  it('counts videos already present in the destination as migrated', async () => {
    mockExisting.mockResolvedValue(new Set(['video2']));
    mockAdd.mockResolvedValue(['video1', 'video3']); // video2 skipped as duplicate

    await migrateSpotifyPlaylistToYoutube('user-1', 'SP_PL', 'YT_DEST');

    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.sourceTrackIds).toEqual(['spTrack1', 'spTrack2', 'spTrack3']);
    expect(upsert.update.lastSyncStatus).toBe('SUCCESS');
  });

  it('appends to the existing ledger instead of replacing it', async () => {
    mockPrisma.playlistMigration.findFirst.mockResolvedValue({
      sourceTrackIds: ['spTrack1'],
    });
    // Only tracks 2 and 3 are new; both searched, matched, added
    mockSearch.mockResolvedValue([ytSearchResult(1), ytSearchResult(2)]);
    mockLlm.mockResolvedValue({ '1': 1, '2': 1 });
    mockAdd.mockResolvedValue(['video1', 'video2']);

    await migrateSpotifyPlaylistToYoutube('user-1', 'SP_PL', 'YT_DEST');

    // Search ran only for the two NEW tracks
    expect(mockSearch.mock.calls[0][1]).toHaveLength(2);
    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.sourceTrackIds).toEqual(
      expect.arrayContaining(['spTrack1', 'spTrack2', 'spTrack3']),
    );
    expect(upsert.update.sourceTrackIds).toHaveLength(3);
  });

  it('marks a whole failed LLM chunk as failed instead of aborting (P2-5)', async () => {
    mockLlm.mockResolvedValue(null);
    mockAdd.mockResolvedValue([]);

    const result = await migrateSpotifyPlaylistToYoutube('user-1', 'SP_PL', 'YT_DEST');

    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(3);
    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.sourceTrackIds).toEqual([]);
  });
});
