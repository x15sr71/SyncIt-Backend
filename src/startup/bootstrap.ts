import prisma from "../db/prisma";
import redis from "../config/redis";

export async function bootstrap() {
  console.log("🔌 Running backend bootstrap...");

  // Redis
  try {
    console.log("🔌 Waiting for Redis...");
    await redis.ping(); // just verifies connection
    console.log("🟢 Redis connected");
  } catch (err) {
    console.error("❌ Redis connection failed");
    console.error(err);
    throw new Error("REDIS_CONNECTION_FAILED");
  }

  // Database (Prisma)
  try {
    console.log("🔌 Connecting to PostgreSQL...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("🟢 PostgreSQL connected");
  } catch (err) {
    console.error("❌ PostgreSQL connection failed");
    console.error(err);
    throw new Error("DATABASE_CONNECTION_FAILED");
  }
}
