-- CreateEnum
CREATE TYPE "PrimaryService" AS ENUM ('SPOTIFY', 'YOUTUBE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profilePicture" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keepInSync" BOOLEAN NOT NULL DEFAULT true,
    "primaryService" "PrimaryService",
    "lastSyncTime" TIMESTAMP(3),
    "lastSyncTracks" JSONB,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL DEFAULT NOW() + INTERVAL '1 day',

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "SpotifyData" (
    "id" TEXT NOT NULL,
    "spotify_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "picture" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "last_SyncedAt" TIMESTAMP(3),
    "last_playlistTrackIds_hash" TEXT,
    "last_TrackIds" TEXT,
    "notFoundTracks" TEXT,
    "retryToFindTracks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SpotifyData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouTubeData" (
    "id" TEXT NOT NULL,
    "youtube_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "picture" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "last_SyncedAt" TIMESTAMP(3),
    "last_playlistTrackIds_hash" TEXT,
    "last_TracksIds" TEXT,
    "notFoundTracks" TEXT,
    "retryToFindTracks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "YouTubeData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistMigration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourcePlaylistId" TEXT NOT NULL,
    "destinationPlaylistId" TEXT,
    "destinationPlaylistName" TEXT,
    "sourcePlatform" TEXT NOT NULL,
    "destinationPlatform" TEXT NOT NULL,
    "sourceTrackIds" TEXT[],
    "migrationCounter" INTEGER NOT NULL DEFAULT 0,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncIntervalMinutes" INTEGER,
    "nextSyncAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_user_id_session_id_key" ON "sessions"("user_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "SpotifyData_spotify_user_id_key" ON "SpotifyData"("spotify_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeData_youtube_user_id_key" ON "YouTubeData"("youtube_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistMigration_userId_sourcePlaylistId_sourcePlatform_de_key" ON "PlaylistMigration"("userId", "sourcePlaylistId", "sourcePlatform", "destinationPlatform");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotifyData" ADD CONSTRAINT "SpotifyData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeData" ADD CONSTRAINT "YouTubeData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistMigration" ADD CONSTRAINT "PlaylistMigration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
