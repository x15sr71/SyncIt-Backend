import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../src/config/redis', () => ({
  __esModule: true,
  default: { get: jest.fn(), del: jest.fn(), setex: jest.fn() },
}));
jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    session: { findUnique: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import redis from '../src/config/redis';
import prisma from '../src/db/prisma';
import sessionMiddleware from '../src/middlewares/sessionMiddleware';

const mockRedis = redis as unknown as {
  get: jest.Mock<any>;
  del: jest.Mock<any>;
  setex: jest.Mock<any>;
};
const mockPrisma = prisma as any;

function makeReqRes(cookie?: string) {
  const req: any = { cookies: cookie ? { sessionId: cookie } : {} };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    clearCookie: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
}

const futureIso = () => new Date(Date.now() + 3600_000).toISOString();

describe('sessionMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    mockRedis.setex.mockResolvedValue('OK');
  });

  it('authenticates from a valid Redis session', async () => {
    const { req, res, next } = makeReqRes('sess-1');
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ id: 'user-1', email: 'u@example.com', expiresAt: futureIso() }),
    );

    await sessionMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.session).toEqual(expect.objectContaining({ id: 'user-1' }));
    expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to the DB and returns 200 when Redis throws (P1-4 regression)', async () => {
    const { req, res, next } = makeReqRes('sess-1');
    mockRedis.get.mockRejectedValue(new Error('Connection is closed'));
    mockRedis.setex.mockRejectedValue(new Error('Connection is closed'));
    mockPrisma.session.findUnique.mockResolvedValue({
      session_id: 'sess-1',
      user_id: 'user-1',
      expires_at: new Date(Date.now() + 3600_000),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'u@example.com' });

    await sessionMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.session).toEqual(expect.objectContaining({ id: 'user-1' }));
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  it('401s without a cookie', async () => {
    const { req, res, next } = makeReqRes();

    await sessionMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s and cleans up an expired DB session on Redis miss', async () => {
    const { req, res, next } = makeReqRes('sess-1');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.session.findUnique.mockResolvedValue({
      session_id: 'sess-1',
      user_id: 'user-1',
      expires_at: new Date(Date.now() - 1000),
    });
    mockPrisma.session.delete.mockResolvedValue({});

    await sessionMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.clearCookie).toHaveBeenCalledWith('sessionId');
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when neither Redis nor DB know the session', async () => {
    const { req, res, next } = makeReqRes('sess-unknown');
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.session.findUnique.mockResolvedValue(null);

    await sessionMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
