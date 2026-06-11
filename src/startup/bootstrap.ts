import prisma from '../db/prisma';
import redis from '../config/redis';

export async function bootstrap() {
  console.log('🔌 Running backend bootstrap...');

  // Redis — non-fatal: the app degrades gracefully when Redis is unavailable.
  // OAuth state flows and session caching will fail, but all other features work.
  try {
    console.log('🔌 Checking Redis...');
    await redis.ping();
    console.log('🟢 Redis connected');
  } catch (err) {
    console.warn('⚠️  Redis unavailable — continuing with degraded functionality');
    console.warn('   OAuth flows and session caching will not work until Redis recovers.');
  }

  // Database (Prisma)
  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('🟢 PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed');
    console.error(err);
    throw new Error('DATABASE_CONNECTION_FAILED');
  }
}
