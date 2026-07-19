import pino from 'pino';

/**
 * Structured JSON logging (P2-12). Level via LOG_LEVEL; request-scoped
 * logging with request IDs is wired in server.ts via pino-http.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined, // omit pid/hostname noise; the platform adds them
});
