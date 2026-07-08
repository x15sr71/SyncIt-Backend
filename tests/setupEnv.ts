// Loaded via jest setupFiles BEFORE any module import, so modules that
// capture process.env at import time (OAuth client ids/secrets) see values.
process.env.SPOTIFY_CLIENT_ID ??= 'test-spotify-client-id';
process.env.SPOTIFY_CLIENT_SECRET ??= 'test-spotify-client-secret';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.YOUTUBE_API_KEY ??= 'test-youtube-api-key';
