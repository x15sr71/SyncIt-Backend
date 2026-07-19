import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL as string,
    // Only needed by `prisma migrate diff --from-migrations` (drift checks in CI).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
