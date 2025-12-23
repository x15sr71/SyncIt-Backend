import { PrismaClient } from '@prisma/client';
import prisma from "../src/db/prisma";


async function main() {
  console.log('Seeding database...');

  // Create users with associated Spotify and YouTube data
const user1 = await prisma.user.create({
  data: {
    email: 'user1@example.com',
    username: 'user1',
    profilePicture: 'https://via.placeholder.com/150',
    access_token: 'This is an access token',
    keepInSync: true,
    primaryService: 'SPOTIFY',
    lastSyncTime: new Date(),
    lastSyncTracks: {
      tracks: ['track1', 'track2', 'track3']
    },
    spotifyTokens: {
      create: [
        {
          spotify_user_id: 'spotify_user1_id', // ✅ required unique field
          username: 'spotify_user1',
          picture: 'https://via.placeholder.com/150',
          access_token: 'spotify_access_token_1',
          refresh_token: 'spotify_refresh_token_1',
          last_SyncedAt: new Date(),
          last_playlistTrackIds_hash: 'hash_123',
          last_TrackIds: 'track1,track2',
          notFoundTracks: 'trackX,trackY',
          retryToFindTracks: 'trackZ'
        }
      ]
    },
    youtubeTokens: {
      create: [
        {
          username: 'youtube_user1',
          picture: 'https://via.placeholder.com/150',
          access_token: 'youtube_access_token_1',
          refresh_token: 'youtube_refresh_token_1',
          last_SyncedAt: new Date(),
          last_playlistTrackIds_hash: 'hash_abc',
          last_TracksIds: 'yt_track1,yt_track2',
          notFoundTracks: 'yt_trackX',
          retryToFindTracks: 'yt_trackY'
        }
      ]
    }
  }
})


const user2 = await prisma.user.create({
  data: {
    email: 'user2@example.com',
    username: 'user2',
    profilePicture: 'https://via.placeholder.com/150',
    access_token: 'This is an access token',
    keepInSync: false,
    primaryService: 'YOUTUBE',
    lastSyncTime: new Date(),
    lastSyncTracks: { tracks: ['yt_trackA', 'yt_trackB'] },

    spotifyTokens: {
      create: [
        {
          spotify_user_id: 'spotify_user2_id', // ✅ REQUIRED unique field
          username: 'spotify_user2',
          picture: 'https://via.placeholder.com/150',
          access_token: 'spotify_access_token_2',
          refresh_token: 'spotify_refresh_token_2',
          last_SyncedAt: new Date(),
          last_playlistTrackIds_hash: 'hash_456',
          last_TrackIds: 'trackA,trackB',
          notFoundTracks: 'trackC',
          retryToFindTracks: 'trackD'
        }
      ]
    },

    youtubeTokens: {
      create: [
        {
          username: 'youtube_user2',
          picture: 'https://via.placeholder.com/150',
          access_token: 'youtube_access_token_2',
          refresh_token: 'youtube_refresh_token_2',
          last_SyncedAt: new Date(),
          last_playlistTrackIds_hash: 'hash_def',
          last_TracksIds: 'yt_trackC,yt_trackD', // ✅ renamed correctly
          notFoundTracks: 'yt_trackE',
          retryToFindTracks: 'yt_trackF'
        }
      ]
    }
  }
});


  console.log('Seeding complete! Users created:', { user1, user2 });
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
