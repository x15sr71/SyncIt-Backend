import axios from 'axios';
import crypto from 'crypto';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('axios');
jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    spotifyData: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    youTubeData: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock('../src/config/redis', () => ({
  __esModule: true,
  default: { set: jest.fn(), del: jest.fn(), get: jest.fn() },
}));

import prisma from '../src/db/prisma';
import redis from '../src/config/redis';
import { refreshSpotifyToken } from '../src/auth/spotify/spotifyTokenUtil';
import { refreshYoutubeAccessToken } from '../src/auth/youtube/youtubeTokensUtil';
import { decryptToken } from '../src/backend/utility/tokenCrypto';

const mockPrisma = prisma as any;
const mockRedis = redis as unknown as {
  set: jest.Mock<any>;
  del: jest.Mock<any>;
  get: jest.Mock<any>;
};
const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

const KEY = crypto.randomBytes(32).toString('base64');

describe('token refresh (P1-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TOKEN_ENC_KEY = KEY;
    process.env.SPOTIFY_CLIENT_ID = 'cid';
    process.env.SPOTIFY_CLIENT_SECRET = 'csecret';
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.spotifyData.findFirst.mockResolvedValue({
      id: 'sp-row',
      refresh_token: 'stored-refresh',
    });
    mockPrisma.spotifyData.update.mockResolvedValue({});
    mockPrisma.spotifyData.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.youTubeData.findFirst.mockResolvedValue({
      id: 'yt-row',
      refresh_token: 'stored-refresh',
    });
    mockPrisma.youTubeData.update.mockResolvedValue({});
    mockPrisma.youTubeData.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('survives a token endpoint slower than 5s — no transaction involved', async () => {
    jest.useFakeTimers();
    // 8s-slow token endpoint: inside the old interactive transaction this
    // exceeded Prisma's 5s default and aborted with "Transaction already closed".
    mockedPost.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ data: { access_token: 'fresh-token', expires_in: 3600 } } as any),
            8000,
          ),
        ),
    );

    const pending = refreshSpotifyToken('user-1');
    await jest.advanceTimersByTimeAsync(8000);
    const result = await pending;

    expect(result?.access_token).toBe('fresh-token');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    // The persisted token is encrypted at rest
    const update = mockPrisma.spotifyData.update.mock.calls[0][0];
    expect(update.data.access_token.startsWith('enc:v1:')).toBe(true);
    expect(decryptToken(update.data.access_token)).toBe('fresh-token');
  });

  it('serializes concurrent refreshes: loser waits and reuses the winner token', async () => {
    // First caller gets the lock; second does not.
    mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    // Loser's wait sees the lock already released.
    mockRedis.get.mockResolvedValue(null);
    mockedPost.mockResolvedValue({
      data: { access_token: 'winner-token', expires_in: 3600 },
    } as any);

    let rowToken = 'stale';
    mockPrisma.spotifyData.findFirst.mockImplementation(async (args: any) => {
      if (args.select.refresh_token) return { id: 'sp-row', refresh_token: 'stored-refresh' };
      // Loser re-read after waiting: winner already wrote the fresh row.
      return {
        access_token: rowToken,
        token_expires_at: new Date(Date.now() + 3600_000),
      };
    });
    mockPrisma.spotifyData.update.mockImplementation(async (args: any) => {
      rowToken = args.data.access_token;
      return {};
    });

    const [winner, loser] = await Promise.all([
      refreshSpotifyToken('user-1'),
      refreshSpotifyToken('user-1'),
    ]);

    // Exactly ONE outbound refresh call — the race is serialized.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(winner?.access_token).toBe('winner-token');
    expect(loser?.access_token).toBe('winner-token');
  });

  it('marks spotify needs_reconnect on invalid_grant and throws the re-auth error', async () => {
    mockedPost.mockRejectedValue({
      response: { status: 400, data: { error: 'invalid_grant' } },
      message: 'Request failed with status code 400',
    });

    await expect(refreshSpotifyToken('user-1')).rejects.toThrow(/re-authenticate/i);

    expect(mockPrisma.spotifyData.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { needs_reconnect: true },
    });
    // Lock released even on the error path
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('marks youtube needs_reconnect on invalid_grant and reports the error code', async () => {
    mockedPost.mockRejectedValue({
      response: { status: 400, data: { error: 'invalid_grant' } },
      message: 'Request failed with status code 400',
    });

    const result = await refreshYoutubeAccessToken('user-1');

    expect(result).toEqual({ success: false, error: 'invalid_grant' });
    expect(mockPrisma.youTubeData.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { needs_reconnect: true },
    });
  });
});
