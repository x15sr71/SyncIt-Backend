import prisma from '../db/prisma';
import redis from '../config/redis';

export async function bootstrap() {
  console.log('🔌 Running backend bootstrap...');

  // Refuse to store plaintext OAuth tokens in production (P1-1).
  if (process.env.NODE_ENV === 'production' && !process.env.TOKEN_ENC_KEY) {
    throw new Error('TOKEN_ENC_KEY is required in production (openssl rand -base64 32)');
  }

  // Redis: required in production — it backs OAuth state (login), session
  // caching, sync locks, and rate limiting. Dev degrades: authenticated
  // reads fall back to the DB, but login will not work until Redis is up.
  try {
    console.log('🔌 Checking Redis...');
    await redis.ping();
    console.log('🟢 Redis connected');
  } catch (err: any) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Redis connection failed (required in production)');
      throw new Error('REDIS_CONNECTION_FAILED');
    }
    console.warn('⚠️  Redis unavailable — continuing with degraded functionality (dev only)');
    console.warn('   OAuth login will not work until Redis recovers.');
  }

  // Database (Prisma)
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('🟢 PostgreSQL connected');
  } catch (err: any) {
    console.error('❌ PostgreSQL connection failed');
    console.error(err);
    throw new Error('DATABASE_CONNECTION_FAILED');
  }
}
