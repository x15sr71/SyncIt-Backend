import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    youTubeData: { findFirst: jest.fn() },
    spotifyData: { findFirst: jest.fn(), update: jest.fn() },
    playlistMigration: { findFirst: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock('../src/backend/services/search/searchSpotify/searchYoutube', () => ({
  searchYoutubeTracks: jest.fn(),
}));
jest.mock('../src/backend/services/search/searchSpotify/searchSpotify', () => ({
  searchTracksOnSpotify: jest.fn(),
}));
jest.mock('../src/backend/openAI/getBestMatch', () => ({
  callLlmJsonWithRetry: jest.fn(),
}));
jest.mock('../src/backend/services/addTo/addToSptPlaylist', () => ({
  addToSptPlaylist: jest.fn(),
}));
jest.mock('../src/auth/youtube/youtubeTokensUtil', () => ({
  get_YoutubeAccessToken: jest.fn(),
}));
jest.mock('axios');

import prisma from '../src/db/prisma';
import { searchYoutubeTracks } from '../src/backend/services/search/searchSpotify/searchYoutube';
import { searchTracksOnSpotify } from '../src/backend/services/search/searchSpotify/searchSpotify';
import { callLlmJsonWithRetry } from '../src/backend/openAI/getBestMatch';
import { addToSptPlaylist } from '../src/backend/services/addTo/addToSptPlaylist';
import {
  migrateYoutubeToSpotifyService,
  migrateYoutubePlaylistToSpotify,
} from '../src/backend/services/migration/youtubeToSpotify';

const mockPrisma = prisma as any;
const mockSearchYt = searchYoutubeTracks as jest.Mock<any>;
const mockSearchSp = searchTracksOnSpotify as jest.Mock<any>;
const mockLlm = callLlmJsonWithRetry as jest.Mock<any>;
const mockAdd = addToSptPlaylist as jest.Mock<any>;

const ytTrack = (n: number) => ({
  trackNumber: n,
  trackId: `ytTrack${n}`,
  title: `Song ${n}`,
  description: `desc ${n}`,
  videoChannelTitle: `Channel ${n}`,
  duration: '3:00',
  publishedDate: '2024-01-01',
});

const spResult = (n: number, id: string) => ({
  title: `Song ${n}`,
  trackNumber: n,
  youtubeChannelName: `Channel ${n}`,
  query: `Song ${n}`,
  results: [
    {
      id,
      trackNumber: n,
      name: `Song ${n}`,
      artists: 'Artist',
      release_date: '2024-01-01',
      duration: '3:00',
      resultNumber: 1,
    },
  ],
});

function setupBase() {
  mockPrisma.youTubeData.findFirst.mockResolvedValue({ id: 'ytdata-1' });
  mockPrisma.spotifyData.findFirst.mockResolvedValue({ id: 'spdata-1' });
  mockPrisma.spotifyData.update.mockResolvedValue({});
  mockPrisma.playlistMigration.findFirst.mockResolvedValue({ sourceTrackIds: [] });
  mockPrisma.playlistMigration.upsert.mockResolvedValue({});
  mockSearchYt.mockResolvedValue({ success: true, data: [ytTrack(1), ytTrack(2)] });
  mockSearchSp.mockResolvedValue([spResult(1, 'a'.repeat(22)), spResult(2, 'b'.repeat(22))]);
  mockLlm.mockResolvedValue({ '1': 1, '2': 1 });
}

describe('migrateYoutubeToSpotifyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupBase();
  });

  it('uses the destination playlist ID as an ID, not a name (P0-9)', async () => {
    mockAdd.mockResolvedValue({
      playlistId: 'SP_DEST',
      addedTrackIds: ['a'.repeat(22), 'b'.repeat(22)],
      alreadyPresentTrackIds: [],
      failedTrackIds: [],
    });

    await migrateYoutubeToSpotifyService('user-1', 'YT_PL', 'Some Name', 'SP_DEST');

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [ids, userId, playlistName, destinationPlaylistId] = mockAdd.mock.calls[0] as any[];
    expect(destinationPlaylistId).toBe('SP_DEST');
    expect(playlistName).toBe('Some Name');
    expect(ids).toEqual(['a'.repeat(22), 'b'.repeat(22)]);
    expect(userId).toBe('user-1');

    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.destinationPlaylistId).toBe('SP_DEST');
  });

  it('persists only actually-added source IDs when the add partially fails (P1-8)', async () => {
    mockAdd.mockResolvedValue({
      playlistId: 'SP_DEST',
      addedTrackIds: ['a'.repeat(22)], // Song 1 added
      alreadyPresentTrackIds: [],
      failedTrackIds: ['b'.repeat(22)], // Song 2's batch failed
    });

    await migrateYoutubeToSpotifyService('user-1', 'YT_PL', 'Name', 'SP_DEST');

    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    // Ledger holds SOURCE-platform IDs, and only for tracks in the destination
    expect(upsert.update.sourceTrackIds).toEqual(['ytTrack1']);
    expect(upsert.update.lastSyncStatus).toBe('PARTIAL');
    // The failed track is reported for retry
    const report = JSON.parse(mockPrisma.spotifyData.update.mock.calls[0][0].data.retryToFindTracks);
    expect(report.join('\n')).toContain('Song 2');
  });

  it('counts destination-dedup skips as migrated (no duplicate adds, no retry loop)', async () => {
    mockAdd.mockResolvedValue({
      playlistId: 'SP_DEST',
      addedTrackIds: ['a'.repeat(22)],
      alreadyPresentTrackIds: ['b'.repeat(22)], // already in the playlist
      failedTrackIds: [],
    });

    await migrateYoutubeToSpotifyService('user-1', 'YT_PL', 'Name', 'SP_DEST');

    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.sourceTrackIds).toEqual(['ytTrack1', 'ytTrack2']);
    expect(upsert.update.lastSyncStatus).toBe('SUCCESS');
  });

  it('keeps LLM-failed chunks out of the ledger so later runs retry them (P2-5)', async () => {
    mockLlm.mockResolvedValue(null); // chunk failed after retry
    mockAdd.mockResolvedValue({
      playlistId: 'SP_DEST',
      addedTrackIds: [],
      alreadyPresentTrackIds: [],
      failedTrackIds: [],
    });

    const result = await migrateYoutubeToSpotifyService('user-1', 'YT_PL', 'Name', 'SP_DEST');

    expect(result.failedTrackDetails.length).toBe(2);
    // No tracks matched -> nothing added, nothing persisted as migrated
    expect(mockAdd).not.toHaveBeenCalled();
    const upsert = mockPrisma.playlistMigration.upsert.mock.calls[0][0];
    expect(upsert.update.sourceTrackIds).toEqual([]);
  });

  it('skips already-migrated source tracks before searching (ledger dedup)', async () => {
    mockPrisma.playlistMigration.findFirst.mockResolvedValue({
      sourceTrackIds: ['ytTrack1', 'ytTrack2'],
    });

    const result = await migrateYoutubeToSpotifyService('user-1', 'YT_PL', 'Name', 'SP_DEST');

    expect(result.numberOfTracksAdded).toBe(0);
    expect(mockSearchSp).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
  });
});

describe('migrateYoutubePlaylistToSpotify (scheduler wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupBase();
  });

  it('forwards the destination Spotify playlist ID as the service 4th arg (P0-9)', async () => {
    mockAdd.mockResolvedValue({
      playlistId: 'SP_DEST',
      addedTrackIds: ['a'.repeat(22), 'b'.repeat(22)],
      alreadyPresentTrackIds: [],
      failedTrackIds: [],
    });

    const result = await migrateYoutubePlaylistToSpotify('user-1', 'YT_PL', 'SP_DEST');

    expect(result.success).toBe(true);
    const [, , , destinationPlaylistId] = mockAdd.mock.calls[0] as any[];
    expect(destinationPlaylistId).toBe('SP_DEST');
  });
});
