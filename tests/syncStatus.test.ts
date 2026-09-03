import { deriveSyncStatus } from '../src/backend/utility/syncStatus';

describe('deriveSyncStatus', () => {
  it('is FAILED when nothing was added and tracks failed', () => {
    // The regression this exists for: 0 added / 7 failed was stored as
    // PARTIAL and rendered as a green "Success" badge.
    expect(deriveSyncStatus(0, 7)).toBe('FAILED');
  });

  it('is PARTIAL only when something succeeded and something failed', () => {
    expect(deriveSyncStatus(5, 2)).toBe('PARTIAL');
  });

  it('is SUCCESS when tracks were added and none failed', () => {
    expect(deriveSyncStatus(5, 0)).toBe('SUCCESS');
  });

  it('is SUCCESS for a no-op run (already in sync)', () => {
    expect(deriveSyncStatus(0, 0)).toBe('SUCCESS');
  });
});
