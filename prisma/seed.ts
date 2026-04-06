import prisma from '../src/db/index'
import { pool } from '../src/db/index'

async function main() {
  console.log('🌱 Starting database seed...')

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.log('⚠️ Skipping seed in production')
    return
  }

  console.log('📡 DB:', process.env.DATABASE_URL?.slice(0, 50) + '...')

  // =========================
  // USERS
  // =========================
  const user1 = await prisma.user.upsert({
    where: { email: 'user1@example.com' },
    update: {},
    create: {
      email: 'user1@example.com',
      username: 'user1',
      profilePicture: 'https://via.placeholder.com/150',
      access_token: 'user1_access_token',
      refresh_token: 'user1_refresh_token',
      keepInSync: true,
      primaryService: 'SPOTIFY',
      lastSyncTime: new Date(),
      lastSyncTracks: {
        tracks: ['spotify_track_1', 'spotify_track_2']
      }
    }
  })

  console.log('User1 done:', user1.email)

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@example.com' },
    update: {},
    create: {
      email: 'user2@example.com',
      username: 'user2',
      profilePicture: 'https://via.placeholder.com/150',
      access_token: 'user2_access_token',
      refresh_token: 'user2_refresh_token',
      keepInSync: false,
      primaryService: 'YOUTUBE',
      lastSyncTime: new Date(),
      lastSyncTracks: {
        tracks: ['yt_track_1', 'yt_track_2']
      }
    }
  })

  console.log('User2 done:', user2.email)

  // =========================
  // SPOTIFY DATA
  // =========================
  await prisma.spotifyData.upsert({
    where: { spotify_user_id: 'spotify_uid_1' },
    update: {},
    create: {
      spotify_user_id: 'spotify_uid_1',
      username: 'spotify_user1',
      picture: 'https://via.placeholder.com/150',
      access_token: 'spotify_access_token_1',
      refresh_token: 'spotify_refresh_token_1',
      last_SyncedAt: new Date(),
      last_playlistTrackIds_hash: 'hash_spotify_123',
      last_TrackIds: JSON.stringify(['sp1', 'sp2', 'sp3']),
      notFoundTracks: JSON.stringify(['missing_sp_track']),
      retryToFindTracks: JSON.stringify(['retry_sp_track']),
      user: {
        connect: { id: user1.id }
      }
    }
  })

  await prisma.spotifyData.upsert({
    where: { spotify_user_id: 'spotify_uid_2' },
    update: {},
    create: {
      spotify_user_id: 'spotify_uid_2',
      username: 'spotify_user2',
      picture: 'https://via.placeholder.com/150',
      access_token: 'spotify_access_token_2',
      refresh_token: 'spotify_refresh_token_2',
      last_SyncedAt: new Date(),
      last_playlistTrackIds_hash: 'hash_spotify_456',
      last_TrackIds: JSON.stringify(['sp4', 'sp5']),
      notFoundTracks: JSON.stringify([]),
      retryToFindTracks: JSON.stringify([]),
      user: {
        connect: { id: user1.id }
      }
    }
  })

  console.log('Spotify data seeded')

  // =========================
  // YOUTUBE DATA
  // =========================
  await prisma.youTubeData.upsert({
    where: {
      youtube_user_id: 'yt_user_1'
    },
    update: {},
    create: {
      youtube_user_id: 'yt_user_1',
      username: 'youtube_user1',
      picture: 'https://via.placeholder.com/150',
      access_token: 'yt_access_token_1',
      refresh_token: 'yt_refresh_token_1',
      last_SyncedAt: new Date(),
      last_playlistTrackIds_hash: 'hash_yt_123',
      last_TracksIds: JSON.stringify(['yt1', 'yt2', 'yt3']),
      notFoundTracks: JSON.stringify(['missing_yt_track']),
      retryToFindTracks: JSON.stringify(['retry_yt_track']),
      user: {
        connect: { id: user1.id }
      }
    }
  })

  await prisma.youTubeData.upsert({
    where: {
      youtube_user_id: 'yt_user_2'
    },
    update: {},
    create: {
      youtube_user_id: 'yt_user_2',
      username: 'youtube_user2',
      picture: 'https://via.placeholder.com/150',
      access_token: 'yt_access_token_2',
      refresh_token: 'yt_refresh_token_2',
      last_SyncedAt: new Date(),
      last_playlistTrackIds_hash: 'hash_yt_456',
      last_TracksIds: JSON.stringify(['yt4', 'yt5']),
      notFoundTracks: JSON.stringify([]),
      retryToFindTracks: JSON.stringify([]),
      user: {
        connect: { id: user2.id }
      }
    }
  })

  console.log('YouTube data seeded')

  // =========================
  // SESSION (OPTIONAL)
  // =========================
  await prisma.session.create({
    data: {
      user_id: user1.id,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  })

  console.log('Session created')

  // =========================
  // PLAYLIST MIGRATION (VERY IMPORTANT FOR YOUR APP)
  // =========================
  await prisma.playlistMigration.upsert({
    where: {
      userId_sourcePlaylistId_sourcePlatform_destinationPlatform: {
        userId: user1.id,
        sourcePlaylistId: 'sp_playlist_1',
        sourcePlatform: 'SPOTIFY',
        destinationPlatform: 'YOUTUBE'
      }
    },
    update: {},
    create: {
      userId: user1.id,
      sourcePlaylistId: 'sp_playlist_1',
      destinationPlaylistId: 'yt_playlist_1',
      sourcePlatform: 'SPOTIFY',
      destinationPlatform: 'YOUTUBE',
      sourceTrackIds: ['sp1', 'sp2', 'sp3'],
      migrationCounter: 1
    }
  })

  console.log('Playlist migration seeded')

  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })