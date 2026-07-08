import prisma from '../../../db/prisma';

/**
 * Tracks that failed to reach YOUTUBE (i.e. Spotify→YouTube runs).
 *
 * Reads the per-playlist, append-only PlaylistMigration.failedTracks store
 * (P2-6); merges legacy per-account retryToFindTracks (with the JSON.parse
 * the old code forgot — it returned a raw string blob to the client).
 */
export const getNotFoundTracksFromYoutube = async (userId: string) => {
  try {
    const migrations = await prisma.playlistMigration.findMany({
      where: { userId, destinationPlatform: 'YOUTUBE' },
      select: { sourcePlaylistId: true, failedTracks: true, lastSyncAt: true },
    });

    const perPlaylist = migrations.flatMap((migration) =>
      (Array.isArray(migration.failedTracks) ? (migration.failedTracks as string[]) : []).map(
        (detail) => ({
          playlistId: migration.sourcePlaylistId,
          detail,
          lastSyncAt: migration.lastSyncAt,
        }),
      ),
    );

    // Legacy per-account storage (pre-P2-6 rows).
    const legacyRow = await prisma.youTubeData.findFirst({
      where: { userId },
      select: { retryToFindTracks: true },
    });
    let legacy: Array<{ playlistId: null; detail: string; lastSyncAt: null }> = [];
    if (legacyRow?.retryToFindTracks) {
      try {
        const parsed = JSON.parse(legacyRow.retryToFindTracks);
        if (Array.isArray(parsed)) {
          legacy = parsed.map((detail: string) => ({ playlistId: null, detail, lastSyncAt: null }));
        }
      } catch {
        // Old malformed value — ignore.
      }
    }

    const tracks = [...perPlaylist, ...legacy];

    if (tracks.length === 0) {
      return {
        success: true,
        message: 'No tracks are marked as not found. Nothing to retry.',
        data: [],
      };
    }

    return {
      success: true,
      data: tracks,
    };
  } catch (error: any) {
    console.error('Error fetching not found YouTube tracks:', error);

    return {
      success: false,
      error: 'FETCH_FAILED',
      message: 'Failed to retrieve not found tracks from YouTube data.',
    };
  }
};
