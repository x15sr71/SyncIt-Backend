import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../src/db', () => ({
  __esModule: true,
  default: {
    playlistMigration: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock('../src/backend/services/migration/spotifyToYoutube', () => ({
  migrateSpotifyPlaylistToYoutube: jest.fn(),
}));
jest.mock('../src/backend/services/migration/youtubeToSpotify', () => ({
  migrateYoutubePlaylistToSpotify: jest.fn(),
}));
jest.mock('../src/config/redis', () => ({
  __esModule: true,
  default: {
    set: jest.fn(),
    del: jest.fn(),
  },
}));

import prisma from '../src/db';
import redis from '../src/config/redis';
import { migrateSpotifyPlaylistToYoutube } from '../src/backend/services/migration/spotifyToYoutube';
import { migrateYoutubePlaylistToSpotify } from '../src/backend/services/migration/youtubeToSpotify';
import { ScheduledSyncService } from '../src/backend/services/scheduleSync/scheduledSyncService';

const mockPrisma = prisma as unknown as {
  playlistMigration: {
    findMany: jest.Mock<any>;
    update: jest.Mock<any>;
    updateMany: jest.Mock<any>;
  };
};
const mockRedis = redis as unknown as { set: jest.Mock<any>; del: jest.Mock<any> };
const mockSpToYt = migrateSpotifyPlaylistToYoutube as jest.Mock<any>;
const mockYtToSp = migrateYoutubePlaylistToSpotify as jest.Mock<any>;

const baseMigration = {
  id: 'mig-1',
  userId: 'user-1',
  sourcePlaylistId: 'SRC_PL',
  destinationPlaylistId: 'DEST_PL',
  sourcePlatform: 'SPOTIFY',
  destinationPlatform: 'YOUTUBE',
  sourceTrackIds: ['sp1', 'sp2'],
  migrationCounter: 3,
  syncIntervalMinutes: 60,
  nextSyncAt: new Date(Date.now() - 1000),
};

describe('ScheduledSyncService.executeMigration (P0-8 ledger regression)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.playlistMigration.update.mockResolvedValue({});
  });

  it('never writes sourceTrackIds or migrationCounter — the ledger keeps source-platform IDs across runs', async () => {
    mockSpToYt.mockResolvedValue({
      success: true,
      addedCount: 2,
      failedCount: 0,
      videoIds: ['ytVideo1', 'ytVideo2'], // destination-platform IDs the old code wrote into the ledger
      failedDetails: [],
    });

    // Two simulated scheduled runs
    await ScheduledSyncService.executeMigration({ ...baseMigration });
    await ScheduledSyncService.executeMigration({ ...baseMigration });

    expect(mockPrisma.playlistMigration.update).toHaveBeenCalledTimes(2);
    for (const call of mockPrisma.playlistMigration.update.mock.calls) {
      const data = (call[0] as any).data;
      // The inner services own the ledger and the counter; the scheduler
      // writing them was P0-8 (destination IDs replacing source IDs and a
      // second counter increment per run).
      expect(data).not.toHaveProperty('sourceTrackIds');
      expect(data).not.toHaveProperty('migrationCounter');
      expect(data.lastSyncStatus).toBe('SUCCESS');
    }
  });

  it('passes (userId, sourcePlaylistId, destinationPlaylistId) to the YT->SP wrapper (P0-9 arg order)', async () => {
    mockYtToSp.mockResolvedValue({ success: true, addedCount: 0, failedCount: 0 });

    await ScheduledSyncService.executeMigration({
      ...baseMigration,
      sourcePlatform: 'YOUTUBE',
      destinationPlatform: 'SPOTIFY',
      sourcePlaylistId: 'YT_SOURCE',
      destinationPlaylistId: 'SP_DEST',
    });

    expect(mockYtToSp).toHaveBeenCalledWith('user-1', 'YT_SOURCE', 'SP_DEST');
  });

  it('skips execution without failing the row when the per-user mutex is held', async () => {
    mockRedis.set.mockResolvedValue(null); // lock not acquired

    const result = await ScheduledSyncService.executeMigration({ ...baseMigration });

    expect(result).toEqual({ success: false, skipped: true });
    expect(mockSpToYt).not.toHaveBeenCalled();
    // Only the SKIPPED status write, never a FAIL/SUCCESS completion write
    const statuses = mockPrisma.playlistMigration.update.mock.calls.map(
      (c: any[]) => (c[0] as any).data.lastSyncStatus,
    );
    expect(statuses).toEqual(['SKIPPED']);
  });

  it('releases the per-user mutex even when the migration throws', async () => {
    mockSpToYt.mockRejectedValue(new Error('provider exploded'));

    await expect(ScheduledSyncService.executeMigration({ ...baseMigration })).rejects.toThrow(
      'provider exploded',
    );

    expect(mockRedis.del).toHaveBeenCalledWith('sync:running:user-1');
  });
});

describe('ScheduledSyncService cron single-execution (P0-10 regression)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.playlistMigration.update.mockResolvedValue({});
  });

  it('with one due migration, two concurrent ticks execute it exactly once', async () => {
    // In-memory row emulating the DB: the conditional UPDATE on
    // nextSyncAt <= now is what makes the claim atomic.
    const row = { ...baseMigration, nextSyncAt: new Date(Date.now() - 1000) };

    mockPrisma.playlistMigration.findMany.mockResolvedValue([row]);
    mockPrisma.playlistMigration.updateMany.mockImplementation(async (args: any) => {
      const due = row.nextSyncAt.getTime() <= Date.now();
      if (args.where.id === row.id && due) {
        row.nextSyncAt = args.data.nextSyncAt; // advance BEFORE executing
        return { count: 1 };
      }
      return { count: 0 };
    });
    mockSpToYt.mockResolvedValue({ success: true, videoIds: [], failedDetails: [] });

    // Simulate the old double-fire: two cron subsystems ticking at once
    await Promise.all([ScheduledSyncService.runCronJob(), ScheduledSyncService.runCronJob()]);

    expect(mockSpToYt).toHaveBeenCalledTimes(1);
    expect(mockPrisma.playlistMigration.updateMany).toHaveBeenCalledTimes(2);
  });

  it('claimMigration advances nextSyncAt before execution and refuses a second claim', async () => {
    const row = { ...baseMigration, nextSyncAt: new Date(Date.now() - 1000) };
    mockPrisma.playlistMigration.updateMany.mockImplementation(async (args: any) => {
      if (row.nextSyncAt.getTime() <= Date.now()) {
        row.nextSyncAt = args.data.nextSyncAt;
        return { count: 1 };
      }
      return { count: 0 };
    });

    await expect(ScheduledSyncService.claimMigration(row)).resolves.toBe(true);
    expect(row.nextSyncAt.getTime()).toBeGreaterThan(Date.now());
    await expect(ScheduledSyncService.claimMigration(row)).resolves.toBe(false);
  });
});
