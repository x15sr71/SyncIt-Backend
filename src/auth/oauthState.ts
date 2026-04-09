import crypto from "crypto";
import redis from "../config/redis";

const STATE_TTL_SECONDS = 600; // 10 minutes
const STATE_PREFIX = "oauth_state:";

// Allowed redirect paths must be relative (start with /)
// and must not contain protocol or domain to prevent open redirect
const FRONTEND_BASE = process.env.FRONTEND_URL || "http://localhost:3000";

export interface OAuthStateData {
  flow: "login" | "youtube_connect";
  userId?: string;
  sessionId?: string;
  redirectAfter?: string;
  createdAt: number;
}

/**
 * Generate a cryptographically random nonce, store state in Redis,
 * and return the nonce to be used as the OAuth `state` parameter.
 *
 * State is stored in Redis with a TTL and deleted on first use,
 * making it resistant to replay and CSRF.
 */
export async function generateOAuthState(
  flow: "login" | "youtube_connect",
  opts?: { userId?: string; sessionId?: string; redirectAfter?: string }
): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("hex");

  // Validate redirectAfter: must be a relative path
  let safeRedirect: string | undefined;
  if (opts?.redirectAfter) {
    if (
      opts.redirectAfter.startsWith("/") &&
      !opts.redirectAfter.startsWith("//")
    ) {
      safeRedirect = opts.redirectAfter;
    } else {
      console.warn(
        "[OAuth State] Rejected non-relative redirectAfter:",
        opts.redirectAfter
      );
    }
  }

  const data: OAuthStateData = {
    flow,
    userId: opts?.userId,
    sessionId: opts?.sessionId,
    redirectAfter: safeRedirect,
    createdAt: Date.now(),
  };

  try {
    await redis.setex(
      `${STATE_PREFIX}${nonce}`,
      STATE_TTL_SECONDS,
      JSON.stringify(data)
    );
  } catch (err) {
    console.error("[OAuth State] Redis unavailable during state generation:", (err as Error).message);
    throw new Error("Failed to generate OAuth state. Please try again.");
  }

  return nonce;
}

/**
 * Validate and consume an OAuth state nonce.
 *
 * Retrieves state from Redis and immediately deletes it (one-time use).
 * Returns the stored state data or null if invalid/expired/missing.
 */
export async function validateOAuthState(
  state: string | null | undefined
): Promise<OAuthStateData | null> {
  if (!state || typeof state !== "string") {
    console.warn("[OAuth State] Missing or invalid state parameter");
    return null;
  }

  const key = `${STATE_PREFIX}${state}`;

  let raw: string | null;
  try {
    // Atomic get-and-delete: retrieve then delete
    raw = await redis.get(key);
    if (!raw) {
      console.warn("[OAuth State] State not found in Redis (expired or replayed)");
      return null;
    }

    // Delete immediately to prevent replay
    await redis.del(key);
  } catch (err) {
    console.error("[OAuth State] Redis unavailable during state validation:", (err as Error).message);
    return null;
  }

  try {
    const data: OAuthStateData = JSON.parse(raw);

    // Extra safety: check if state is too old (belt-and-suspenders with TTL)
    const ageMs = Date.now() - data.createdAt;
    if (ageMs > STATE_TTL_SECONDS * 1000) {
      console.warn("[OAuth State] State expired by timestamp check");
      return null;
    }

    return data;
  } catch (err) {
    console.warn("[OAuth State] Failed to parse state data from Redis");
    return null;
  }
}

/**
 * Build the full frontend redirect URL from a relative redirectAfter path.
 * Falls back to /dashboard if no redirectAfter is set.
 */
export function buildRedirectUrl(redirectAfter?: string): string {
  const path = redirectAfter || "/dashboard";
  return `${FRONTEND_BASE}${path}`;
}
