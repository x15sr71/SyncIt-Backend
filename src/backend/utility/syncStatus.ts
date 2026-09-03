/**
 * Single definition of what a migration run's outcome means.
 *
 * Previously each service derived this from the failure count alone
 * (`failed > 0 ? 'PARTIAL' : 'SUCCESS'`), so a run that added zero tracks and
 * failed every one of them was stored as PARTIAL — which the client rendered
 * as a green "Success" badge. Whether anything was actually added is the part
 * that matters, so both counts are required here.
 */
export type SyncStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export function deriveSyncStatus(addedCount: number, failedCount: number): SyncStatus {
  // Nothing failed: either tracks were added, or there was nothing to do and
  // the playlist is already in sync. Both are genuinely fine.
  if (failedCount === 0) return 'SUCCESS';

  // Something failed. It is only "partial" if something also succeeded.
  return addedCount > 0 ? 'PARTIAL' : 'FAILED';
}
