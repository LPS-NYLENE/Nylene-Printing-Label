export const PR_PRINT_BUSY_MESSAGE =
    "One station is currently busy. Please wait...";

/** Max age of a lock heartbeat before another station may take over. */
export const PR_PRINT_LOCK_STALE_MS = 20 * 1000;

/**
 * @param {{ holderId?: string, renewedAt?: number, heldAt?: number } | null | undefined} current
 * @param {number} nowMs
 * @param {number} [staleMs]
 */
export function isPrPrintLockStale(
    current,
    nowMs,
    staleMs = PR_PRINT_LOCK_STALE_MS,
) {
    if (!current || !current.holderId) return true;
    const renewedAt = Number(current.renewedAt || current.heldAt || 0);
    if (!Number.isFinite(renewedAt) || renewedAt <= 0) return true;
    return nowMs - renewedAt > staleMs;
}

/**
 * Decide whether `holderId` may claim the P&R print lock.
 * @param {{ holderId?: string, renewedAt?: number, heldAt?: number } | null | undefined} current
 * @param {string} holderId
 * @param {number} nowMs
 * @param {number} [staleMs]
 */
export function canClaimPrPrintLock(
    current,
    holderId,
    nowMs,
    staleMs = PR_PRINT_LOCK_STALE_MS,
) {
    if (!current || !current.holderId) return true;
    if (String(current.holderId) === String(holderId)) return true;
    return isPrPrintLockStale(current, nowMs, staleMs);
}
