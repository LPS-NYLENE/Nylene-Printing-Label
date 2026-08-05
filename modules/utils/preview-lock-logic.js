export const PR_PREVIEW_BUSY_MESSAGE =
    "One station is currently busy. Please wait...";

/**
 * Max age of a lock heartbeat before another station may take over.
 * Kept well above browser background-timer throttling so an active Preview
 * station is not treated as dead while an operator is still on that page.
 */
export const PR_PREVIEW_LOCK_STALE_MS = 90 * 1000;

/**
 * @param {{ holderId?: string, renewedAt?: number, heldAt?: number } | null | undefined} current
 * @param {number} nowMs
 * @param {number} [staleMs]
 */
export function isPrPreviewLockStale(
    current,
    nowMs,
    staleMs = PR_PREVIEW_LOCK_STALE_MS,
) {
    if (!current || !current.holderId) return true;
    const renewedAt = Number(current.renewedAt || current.heldAt || 0);
    if (!Number.isFinite(renewedAt) || renewedAt <= 0) return true;
    return nowMs - renewedAt > staleMs;
}

/**
 * Decide whether `holderId` may claim the P&R preview lock.
 * @param {{ holderId?: string, renewedAt?: number, heldAt?: number } | null | undefined} current
 * @param {string} holderId
 * @param {number} nowMs
 * @param {number} [staleMs]
 */
export function canClaimPrPreviewLock(
    current,
    holderId,
    nowMs,
    staleMs = PR_PREVIEW_LOCK_STALE_MS,
) {
    if (!current || !current.holderId) return true;
    if (String(current.holderId) === String(holderId)) return true;
    return isPrPreviewLockStale(current, nowMs, staleMs);
}

/**
 * Release / startup cleanup may only delete this browser's own lock.
 * Waiting stations must never wipe another workstation's active Preview lock.
 * @param {{ holderId?: string } | null | undefined} current
 * @param {string} holderId
 */
export function shouldRemoveLockForHolder(current, holderId) {
    if (!current || !current.holderId || !holderId) return false;
    return String(current.holderId) === String(holderId);
}
