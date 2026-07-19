/**
 * End-to-end integration suite: the REAL Express app, real Postgres, real
 * Redis, real token crypto — only outbound provider HTTP (Spotify, Google/
 * YouTube, Gemini) is intercepted with nock.
 *
 * Run with:
 *   INTEGRATION_DB_URL=postgresql://syncit@127.0.0.1:54329/syncit_it npm test
 * (create the empty DB first; migrations are applied by this suite).
 * Skips itself when INTEGRATION_DB_URL is unset so plain `npm test` and CI
 * stay green without local infra.
 */
import { execSync } from 'child_process';
import crypto from 'crypto';
import nock from 'nock';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL;
const describeIf = INTEGRATION_DB_URL ? describe : describe.skip;

const spId = (c: string) => c.repeat(22); // valid 22-char Spotify IDs

describeIf('client↔backend integration (supertest + nock)', () => {
  // Imported lazily so plain `npm test` (skip mode) never touches them.
  let app: import('express').Express;
  let prisma: any;
  let redis: any;

  let userId: string;
  let sessionId: string;
  const cookie = () => [`sessionId=${sessionId}`];

  const YT_SOURCE_PLAYLIST = 'PLintegrationSource1';
  const SP_SOURCE_PLAYLIST = spId('a');
  const YT_DEST_PLAYLIST = 'PLintegrationDest99';

  beforeAll(async () => {
    // Fresh, reproducible schema straight from the committed migrations.
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DIRECT_URL: INTEGRATION_DB_URL! },
      stdio: 'pipe',
    });

    ({ app } = await import('../src/backend/server'));
    prisma = (await import('../src/db/prisma')).default;
    redis = (await import('../src/config/redis')).default;

    const { encryptToken } = await import('../src/backend/utility/tokenCrypto');

    // Seed a dummy user with fake-but-encrypted provider tokens and a live
    // session (both Redis and DB copies, like the real login flow).
    userId = crypto.randomUUID();
    const future = new Date(Date.now() + 3600_000);
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: `it-${userId}@example.com`,
        username: `it-user-${userId}`,
        access_token: encryptToken('google-access'),
        refresh_token: encryptToken('google-refresh'),
      },
    });
    await prisma.spotifyData.create({
      data: {
        userId: user.id,
        spotify_user_id: `sp-${userId}`,
        username: 'IT Spotify',
        picture: '',
        access_token: encryptToken('spotify-access-token'),
        refresh_token: encryptToken('spotify-refresh-token'),
        token_expires_at: future,
      },
    });
    await prisma.youTubeData.create({
      data: {
        userId: user.id,
        youtube_user_id: `yt-${userId}`,
        username: 'IT YouTube',
        picture: '',
        access_token: encryptToken('youtube-access-token'),
        refresh_token: encryptToken('youtube-refresh-token'),
        token_expires_at: future,
      },
    });

    const session = await prisma.session.create({ data: { user_id: user.id } });
    sessionId = session.session_id;
    await redis.setex(
      `session:${sessionId}`,
      3600,
      JSON.stringify({ id: user.id, email: user.email }),
    );

    // Everything outbound must be mocked; local infra stays reachable.
    nock.disableNetConnect();
    nock.enableNetConnect(/127\.0\.0\.1|localhost/);
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    if (prisma) {
      await prisma.playlistMigration.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.session.deleteMany({ where: { user_id: userId } }).catch(() => {});
      await prisma.spotifyData.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.youTubeData.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
      await prisma.$disconnect().catch(() => {});
      const { pool } = await import('../src/db/prisma');
      await pool.end().catch(() => {});
    }
    if (redis) await redis.quit().catch(() => {});
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  /** Gemini answers every chunk with "pick result 1 for every track". */
  function mockGemini() {
    nock('https://generativelanguage.googleapis.com')
      .persist()
      .post(/\/v1beta\/models\/gemini-2\.5-flash:generateContent/)
      .reply(200, (_uri, body: any) => {
        const text: string = body?.contents?.[0]?.parts?.[0]?.text ?? '';
        const trackNumbers = [...text.matchAll(/Track Number: (\d+)/g)].map((m) => Number(m[1]));
        const picks: Record<string, number> = {};
        // Keys are chunk-local for YT→SP and global for SP→YT; with a single
        // chunk both are the same 1..N sequence.
        trackNumbers.forEach((_n, i) => {
          picks[String(i + 1)] = 1;
        });
        return {
          candidates: [{ content: { parts: [{ text: JSON.stringify(picks) }] } }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        };
      });
  }

  it('GET /health reports db + redis up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ status: 'ok', db: true, redis: true }));
  });

  it('GET /me returns the seeded session and both connections', async () => {
    const res = await request(app).get('/me').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.connections.spotify.connected).toBe(true);
    expect(res.body.connections.youtube.connected).toBe(true);
    expect(res.body.connections.spotify.needsReconnect).toBe(false);
  });

  it('GET /me without a cookie is 401', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('GET /getSpotifyplaylists paginates the fixture fully', async () => {
    const page = (offset: number, total: number, count: number) => ({
      total,
      items: Array.from({ length: count }, (_, i) => ({
        id: spId(String((offset + i) % 10)),
        name: `Playlist ${offset + i}`,
        tracks: { total: 5 },
      })),
    });
    nock('https://api.spotify.com')
      .get('/v1/me/playlists')
      .query((q) => Number(q.offset) === 0)
      .reply(200, page(0, 60, 50))
      .get('/v1/me/playlists')
      .query((q) => Number(q.offset) === 50)
      .reply(200, page(50, 60, 10));

    const res = await request(app).get('/getSpotifyplaylists').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(60);
  });

  it('runs a full Spotify→YouTube migration and records source IDs in the ledger', async () => {
    mockGemini();

    const spotifyTracks = [1, 2, 3].map((n) => ({
      track: {
        id: spId(String(n)),
        name: `Song ${n}`,
        artists: [{ name: `Artist ${n}` }],
        album: { name: `Album ${n}`, images: [] },
        duration_ms: 200_000,
      },
    }));
    nock('https://api.spotify.com')
      .persist()
      .get(`/v1/playlists/${SP_SOURCE_PLAYLIST}/items`)
      .query(true)
      .reply(200, { total: 3, items: spotifyTracks });

    const google = nock('https://www.googleapis.com').persist();
    // destination playlist validation
    google
      .get('/youtube/v3/playlists')
      .query((q) => q.id === YT_DEST_PLAYLIST)
      .reply(200, { items: [{ id: YT_DEST_PLAYLIST, snippet: { title: 'Dest' } }] });
    // per-track search: answer with a videoId derived from the track number
    google
      .get('/youtube/v3/search')
      .query(true)
      .reply(200, (uri) => {
        const match = decodeURIComponent(uri).match(/Song\+?\s?(\d)/) ?? uri.match(/Song%20(\d)/);
        const n = match ? match[1] : '9';
        return {
          items: [
            {
              id: { videoId: `vid${n}` },
              snippet: {
                title: `Song ${n} video`,
                channelTitle: `Channel ${n}`,
                publishedAt: '2024-01-01T00:00:00Z',
              },
            },
          ],
        };
      });
    // status filter: everything embeddable/public/processed
    google
      .get('/youtube/v3/videos')
      .query(true)
      .reply(200, (uri) => {
        const idsParam = new URL('https://x' + uri).searchParams.get('id') ?? '';
        return {
          items: idsParam.split(',').map((id) => ({
            id,
            status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' },
            contentDetails: { duration: 'PT3M20S' },
          })),
        };
      });
    // destination contents (empty) for the pre-add snapshot AND add-time dedup
    google.get('/youtube/v3/playlistItems').query(true).reply(200, { items: [] });
    // the actual inserts
    const inserted: string[] = [];
    google
      .post('/youtube/v3/playlistItems', (body) => {
        inserted.push(body?.snippet?.resourceId?.videoId);
        return true;
      })
      .query(true)
      .reply(200, {});

    const res = await request(app)
      .post('/spotify-to-youtube')
      .set('Cookie', cookie())
      .send({ spotifyPlaylistId: SP_SOURCE_PLAYLIST, youtubePlaylistId: YT_DEST_PLAYLIST });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.numberOfTracksAdded).toBe(3);
    expect(inserted.sort()).toEqual(['vid1', 'vid2', 'vid3']);

    // Ledger holds SOURCE-platform (Spotify) IDs — the P0-8 invariant.
    const row = await prisma.playlistMigration.findFirst({
      where: { userId, sourcePlaylistId: SP_SOURCE_PLAYLIST, sourcePlatform: 'SPOTIFY' },
    });
    expect(row).toBeTruthy();
    expect([...row.sourceTrackIds].sort()).toEqual([spId('1'), spId('2'), spId('3')].sort());
    expect(row.migrationCounter).toBe(1);
    expect(row.lastSyncStatus).toBe('SUCCESS');
  });

  it('re-running the same Spotify→YouTube migration is a no-op (ledger dedup)', async () => {
    // Only the source fetch should happen — no search/LLM/insert mocks needed.
    const spotifyTracks = [1, 2, 3].map((n) => ({
      track: {
        id: spId(String(n)),
        name: `Song ${n}`,
        artists: [{ name: `Artist ${n}` }],
        album: { name: `Album ${n}`, images: [] },
        duration_ms: 200_000,
      },
    }));
    nock('https://api.spotify.com')
      .get(`/v1/playlists/${SP_SOURCE_PLAYLIST}/items`)
      .query(true)
      .reply(200, { total: 3, items: spotifyTracks });
    nock('https://www.googleapis.com')
      .get('/youtube/v3/playlists')
      .query(true)
      .reply(200, { items: [{ id: YT_DEST_PLAYLIST }] });

    const res = await request(app)
      .post('/spotify-to-youtube')
      .set('Cookie', cookie())
      .send({ spotifyPlaylistId: SP_SOURCE_PLAYLIST, youtubePlaylistId: YT_DEST_PLAYLIST });

    expect(res.status).toBe(200);
    expect(res.body.numberOfTracksAdded).toBe(0);
    expect(nock.pendingMocks().filter((m) => m.includes('search'))).toHaveLength(0);
  });

  it('runs a full YouTube→Spotify migration via POST /me/playlists + /items', async () => {
    mockGemini();

    const google = nock('https://www.googleapis.com').persist();
    google
      .get('/youtube/v3/playlistItems')
      .query((q) => q.playlistId === YT_SOURCE_PLAYLIST)
      .reply(200, {
        items: [1, 2].map((n) => ({
          snippet: {
            resourceId: { videoId: `srcVid${n}` },
            title: `YT Song ${n}`,
            description: `desc ${n}`,
            videoOwnerChannelTitle: `YT Channel ${n}`,
            publishedAt: '2024-01-01T00:00:00Z',
          },
        })),
      });
    google
      .get('/youtube/v3/videos')
      .query(true)
      .reply(200, (uri) => {
        const idsParam = new URL('https://x' + uri).searchParams.get('id') ?? '';
        return {
          items: idsParam.split(',').map((id) => ({ id, contentDetails: { duration: 'PT3M20S' } })),
        };
      });

    const spotify = nock('https://api.spotify.com').persist();
    // per-track search
    spotify
      .get('/v1/search')
      .query(true)
      .reply(200, (uri) => {
        const match = decodeURIComponent(uri).match(/YT\+?\s?Song\+?\s?(\d)/);
        const n = match ? match[1] : '9';
        return {
          tracks: {
            items: [
              {
                id: spId(`${n}`),
                name: `Matched Song ${n}`,
                artists: [{ name: `Artist ${n}` }],
                album: { release_date: '2024-01-01' },
                duration_ms: 200_000,
              },
            ],
          },
        };
      });
    // no destination ID → find by name (none) → create via POST /me/playlists
    spotify.get('/v1/me/playlists').query(true).reply(200, { items: [] });
    const created: any[] = [];
    spotify
      .post('/v1/me/playlists', (body) => {
        created.push(body);
        return true;
      })
      .reply(201, { id: spId('z') });
    // destination dedup fetch (empty)
    spotify
      .get(`/v1/playlists/${spId('z')}/items`)
      .query(true)
      .reply(200, { total: 0, items: [] });
    // the batched add
    const addedUris: string[] = [];
    spotify
      .post(`/v1/playlists/${spId('z')}/items`, (body) => {
        addedUris.push(...(body?.uris ?? []));
        return true;
      })
      .reply(201, { snapshot_id: 'snap' });

    const res = await request(app)
      .post('/youtube-to-spotify')
      .set('Cookie', cookie())
      .send({ playlistId: YT_SOURCE_PLAYLIST, playlistName: 'My YT Import' });

    expect(res.status).toBe(200);
    expect(res.body.numberOfTracksAdded).toBe(2);
    expect(created[0]?.name).toBe('My YT Import');
    expect(addedUris.sort()).toEqual([`spotify:track:${spId('1')}`, `spotify:track:${spId('2')}`]);

    // Ledger holds SOURCE-platform (YouTube) IDs and the created destination.
    const row = await prisma.playlistMigration.findFirst({
      where: { userId, sourcePlaylistId: YT_SOURCE_PLAYLIST, sourcePlatform: 'YOUTUBE' },
    });
    expect(row).toBeTruthy();
    expect([...row.sourceTrackIds].sort()).toEqual(['srcVid1', 'srcVid2']);
    expect(row.destinationPlaylistId).toBe(spId('z'));
    expect(row.lastSyncStatus).toBe('SUCCESS');
  });

  it('rejects an invalid migration body with 400 before touching providers', async () => {
    const res = await request(app)
      .post('/youtube-to-spotify')
      .set('Cookie', cookie())
      .send({ playlistId: '<script>', playlistName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('logout invalidates the session everywhere', async () => {
    const logout = await request(app).post('/auth/logout').set('Cookie', cookie());
    expect(logout.status).toBe(200);

    const after = await request(app).get('/me').set('Cookie', cookie());
    expect(after.status).toBe(401);
  });
});
