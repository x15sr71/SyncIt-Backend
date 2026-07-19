// Single PrismaClient for the whole app: this module used to construct a
// second client (and second pg pool), doubling connections against the
// Supabase pooler limits (P2-9). Everything now shares src/db/index.ts.
export { default, pool } from './index';
