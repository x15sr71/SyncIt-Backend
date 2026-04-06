import { defineConfig } from '@prisma/config'  // ← @prisma/config, NOT prisma/config
import 'dotenv/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
})