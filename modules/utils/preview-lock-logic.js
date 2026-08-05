export const PR_PREVIEW_BUSY_MESSAGE = "One station currently busy";

/** Max age of a lock heartbeat before another station may take over. */
export const PR_PREVIEW_LOCK_STALE_MS = 30 * 1000;

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
    const renewedAt = Number(current.renewedAt || current.heldAt || 0);
    if (!Number.isFinite(renewedAt) || renewedAt <= 0) return true;
    return nowMs - renewedAt > staleMs;
}
