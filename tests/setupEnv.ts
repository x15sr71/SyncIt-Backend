// Loaded via jest setupFiles BEFORE any module import, so modules that
// capture process.env at import time (OAuth client ids/secrets) see values.
process.env.SPOTIFY_CLIENT_ID ??= 'test-spotify-client-id';
process.env.SPOTIFY_CLIENT_SECRET ??= 'test-spotify-client-secret';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.YOUTUBE_API_KEY ??= 'test-youtube-api-key';

// Integration suite: when INTEGRATION_DB_URL is set, point the app's real
// Prisma client at the local throwaway Postgres (the suite self-skips
// otherwise). Must run before any module captures these at import time.
if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}
process.env.TOKEN_ENC_KEY ??= require('crypto').randomBytes(32).toString('base64');
process.env.GOOGLE_API_KEY ??= 'test-gemini-key';
