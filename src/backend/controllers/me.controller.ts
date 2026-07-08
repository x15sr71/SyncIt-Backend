import { Request, Response } from 'express';
import prisma from '../../db/prisma';

/**
 * GET /me — session + connection status + sync stats.
 *
 * Replaces the dangling middleware-only /sessionmid route (a valid session
 * fell through to Express's 404). The connect page, dashboard widgets and
 * "Reconnect" prompts are all driven from this shape (P2-10, P2-11).
 */
export async function meHandler(req: Request, res: Response) {
  const userId = req.session!.id;

  try {
    const [user, spotify, youtube, migrations] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, username: true, profilePicture: true },
      }),
      prisma.spotifyData.findFirst({
        where: { userId },
        select: { username: true, picture: true, needs_reconnect: true },
      }),
      prisma.youTubeData.findFirst({
        where: { userId },
        select: { username: true, picture: true, needs_reconnect: true },
      }),
      prisma.playlistMigration.findMany({
        where: { userId },
        select: {
          id: true,
          sourcePlaylistId: true,
          destinationPlaylistId: true,
          sourcePlatform: true,
          destinationPlatform: true,
          migrationCounter: true,
          sourceTrackIds: true,
          autoSyncEnabled: true,
          syncIntervalMinutes: true,
          lastSyncAt: true,
          lastSyncStatus: true,
          nextSyncAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const totalSyncs = migrations.reduce((sum, m) => sum + m.migrationCounter, 0);
    const tracksMigrated = migrations.reduce((sum, m) => sum + m.sourceTrackIds.length, 0);
    const finished = migrations.filter((m) => m.lastSyncStatus && m.lastSyncStatus !== 'RUNNING');
    const succeeded = finished.filter(
      (m) => m.lastSyncStatus === 'SUCCESS' || m.lastSyncStatus === 'PARTIAL',
    );

    return res.json({
      success: true,
      user,
      connections: {
        spotify: {
          connected: !!spotify,
          needsReconnect: spotify?.needs_reconnect ?? false,
          username: spotify?.username ?? null,
        },
        youtube: {
          connected: !!youtube,
          needsReconnect: youtube?.needs_reconnect ?? false,
          username: youtube?.username ?? null,
        },
      },
      stats: {
        totalSyncs,
        tracksMigrated,
        successRate: finished.length
          ? Math.round((succeeded.length / finished.length) * 100)
          : null,
        activeAutoSyncs: migrations.filter((m) => m.autoSyncEnabled).length,
      },
      recentSyncs: migrations
        .filter((m) => m.lastSyncAt)
        .sort((a, b) => (b.lastSyncAt as Date).getTime() - (a.lastSyncAt as Date).getTime())
        .slice(0, 5)
        .map((m) => ({
          id: m.id,
          sourcePlaylistId: m.sourcePlaylistId,
          destinationPlaylistId: m.destinationPlaylistId,
          sourcePlatform: m.sourcePlatform,
          destinationPlatform: m.destinationPlatform,
          status: m.lastSyncStatus,
          lastSyncAt: m.lastSyncAt,
          nextSyncAt: m.nextSyncAt,
          autoSyncEnabled: m.autoSyncEnabled,
          trackCount: m.sourceTrackIds.length,
        })),
    });
  } catch (error: any) {
    console.error('[me] Failed to build session status:', error);
    return res.status(500).json({ success: false, message: 'Failed to load account status' });
  }
}
