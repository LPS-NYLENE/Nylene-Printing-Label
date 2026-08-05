import {
    getDatabase,
    ref,
    runTransaction,
    onDisconnect,
    remove,
    get,
    onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAppInstance } from "./firebase-db.js";
import { showScreen } from "./state.js";
import {
    PR_PREVIEW_BUSY_MESSAGE,
    PR_PREVIEW_LOCK_STALE_MS,
    canClaimPrPreviewLock,
    isPrPreviewLockStale,
} from "./utils/preview-lock-logic.js";

const PR_PREVIEW_LOCK_PATH = "previewLocks/pr";
const HOLDER_STORAGE_KEY = "pr_preview_lock_holder_v1";
const HEARTBEAT_MS = 8 * 1000;
const BUSY_RETRY_ATTEMPTS = 4;
const BUSY_RETRY_DELAY_MS = 700;

let heartbeatTimer = null;
let pageHideBound = false;
let heldByUs = false;
let releaseEpoch = 0;
let disconnectConfigured = false;
let serverTimeOffsetMs = 0;
let serverTimeReady = false;

function getDatabaseInstance() {
    return getDatabase(getAppInstance());
}

function getLockRef() {
    return ref(getDatabaseInstance(), PR_PREVIEW_LOCK_PATH);
}

function nowMs() {
    return Date.now() + serverTimeOffsetMs;
}

function ensureServerTimeOffset() {
    if (serverTimeReady) return;
    serverTimeReady = true;
    try {
        const offsetRef = ref(getDatabaseInstance(), ".info/serverTimeOffset");
        onValue(offsetRef, (snap) => {
            const value = Number(snap.val());
            serverTimeOffsetMs = Number.isFinite(value) ? value : 0;
        });
    } catch (err) {
        console.warn("P&R preview lock server time offset failed", err);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPrPreviewLockHolderId() {
    try {
        const existing = sessionStorage.getItem(HOLDER_STORAGE_KEY);
        if (existing) return existing;
        const id =
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `holder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(HOLDER_STORAGE_KEY, id);
        return id;
    } catch {
        return `holder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

function ensurePageHideRelease() {
    if (pageHideBound || typeof window === "undefined") return;
    pageHideBound = true;
    const release = () => {
        void releasePrPreviewLockIfHeld();
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("beforeunload", release);
}

async function cancelDisconnectHook() {
    if (!disconnectConfigured) return;
    try {
        await onDisconnect(getLockRef()).cancel();
    } catch (err) {
        console.warn("P&R preview lock onDisconnect cancel failed", err);
    } finally {
        disconnectConfigured = false;
    }
}

async function configureDisconnectHook() {
    try {
        // Keep this armed until AFTER a successful remove. Canceling first was
        // leaving stuck locks when refresh/unload interrupted the delete.
        await onDisconnect(getLockRef()).remove();
        disconnectConfigured = true;
    } catch (err) {
        console.warn("P&R preview lock onDisconnect setup failed", err);
        disconnectConfigured = false;
    }
}

async function renewLockHeartbeat() {
    if (!heldByUs) return;
    const epoch = releaseEpoch;
    const holderId = getPrPreviewLockHolderId();
    const now = nowMs();
    try {
        const result = await runTransaction(getLockRef(), (current) => {
            if (!heldByUs || epoch !== releaseEpoch) return;
            if (!current || String(current.holderId) !== String(holderId)) {
                return;
            }
            return {
                holderId,
                heldAt: current.heldAt || now,
                renewedAt: now,
            };
        });
        if (!heldByUs || epoch !== releaseEpoch) return;
        if (!result.committed) {
            const value =
                result.snapshot && typeof result.snapshot.val === "function"
                    ? result.snapshot.val()
                    : null;
            if (!value || String(value.holderId) !== String(holderId)) {
                heldByUs = false;
                stopHeartbeat();
            }
        }
    } catch (err) {
        console.warn("P&R preview lock heartbeat failed", err);
    }
}

function startHeartbeat() {
    stopHeartbeat();
    ensurePageHideRelease();
    // Renew immediately so a just-claimed lock does not look stale to peers.
    void renewLockHeartbeat();
    heartbeatTimer = setInterval(() => {
        void renewLockHeartbeat();
    }, HEARTBEAT_MS);
}

async function readLockValue() {
    const snap = await get(getLockRef());
    return snap.exists() ? snap.val() : null;
}

/**
 * Delete the lock when this session owns it, or when it is already stale.
 * Uses remove() (not a null transaction) so unload/refresh cannot strand the node.
 */
export async function releasePrPreviewLockIfHeld() {
    ensureServerTimeOffset();
    releaseEpoch += 1;
    stopHeartbeat();
    heldByUs = false;
    const holderId = getPrPreviewLockHolderId();
    const lockRef = getLockRef();
    try {
        const value = await readLockValue();
        if (!value) {
            await cancelDisconnectHook();
            return;
        }
        const ownsLock = String(value.holderId) === String(holderId);
        const stale = isPrPreviewLockStale(value, nowMs());
        if (ownsLock || stale) {
            await remove(lockRef);
        }
    } catch (err) {
        console.warn("P&R preview lock release failed", err);
    } finally {
        // Only cancel after attempting remove so crash mid-release still cleans up.
        await cancelDisconnectHook();
    }
}

/**
 * On boot / source routing: clear our leftover lock and any stale lock so a
 * waiting station is not blocked forever after the holder refreshed/printed.
 */
export async function clearOwnPrPreviewLockOnStartup() {
    ensureServerTimeOffset();
    await releasePrPreviewLockIfHeld();
    try {
        const value = await readLockValue();
        if (value && isPrPreviewLockStale(value, nowMs())) {
            await remove(getLockRef());
        }
    } catch (err) {
        console.warn("P&R preview lock stale purge failed", err);
    }
}

async function attemptAcquireOnce() {
    const holderId = getPrPreviewLockHolderId();
    const lockRef = getLockRef();
    const now = nowMs();

    // If a stale lock is present, delete it before claiming so release races
    // cannot leave a zombie node that forever reports busy.
    try {
        const existing = await readLockValue();
        if (
            existing &&
            String(existing.holderId) !== String(holderId) &&
            isPrPreviewLockStale(existing, now)
        ) {
            await remove(lockRef);
        }
    } catch (err) {
        console.warn("P&R preview lock stale pre-clear failed", err);
    }

    const result = await runTransaction(lockRef, (current) => {
        const claimNow = nowMs();
        if (
            !canClaimPrPreviewLock(
                current,
                holderId,
                claimNow,
                PR_PREVIEW_LOCK_STALE_MS,
            )
        ) {
            return;
        }
        return {
            holderId,
            heldAt:
                current && String(current.holderId) === String(holderId)
                    ? current.heldAt || claimNow
                    : claimNow,
            renewedAt: claimNow,
        };
    });

    if (!result.committed) {
        return { ok: false, message: PR_PREVIEW_BUSY_MESSAGE };
    }

    const value =
        result.snapshot && typeof result.snapshot.val === "function"
            ? result.snapshot.val()
            : null;
    if (!value || String(value.holderId) !== String(holderId)) {
        return { ok: false, message: PR_PREVIEW_BUSY_MESSAGE };
    }

    heldByUs = true;
    await configureDisconnectHook();
    startHeartbeat();
    return { ok: true };
}

/**
 * Acquire the shared P&R preview lock for this browser tab.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function acquirePrPreviewLock() {
    ensureServerTimeOffset();
    try {
        for (let attempt = 0; attempt < BUSY_RETRY_ATTEMPTS; attempt += 1) {
            const result = await attemptAcquireOnce();
            if (result.ok) return result;
            if (attempt < BUSY_RETRY_ATTEMPTS - 1) {
                await sleep(BUSY_RETRY_DELAY_MS);
            } else {
                return result;
            }
        }
        return { ok: false, message: PR_PREVIEW_BUSY_MESSAGE };
    } catch (err) {
        // Fail open on transport/rules errors so a Firebase outage (or undeployed
        // rules) does not freeze every P&R station. Busy is only returned when
        // another holder is confirmed via a completed transaction.
        console.warn(
            "P&R preview lock acquire failed; continuing without lock",
            err,
        );
        heldByUs = false;
        stopHeartbeat();
        return { ok: true };
    }
}

/**
 * Enter preview, acquiring the P&R station lock when needed.
 * Coperion skips the lock (single station).
 * @param {{ isCoperion?: boolean }} [options]
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function enterPreviewWithLock(options = {}) {
    const isCoperion = Boolean(options.isCoperion);
    if (!isCoperion) {
        const result = await acquirePrPreviewLock();
        if (!result.ok) return result;
    }
    showScreen("preview");
    return { ok: true };
}

export { PR_PREVIEW_BUSY_MESSAGE };
