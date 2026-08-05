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
import {
    PR_PRINT_BUSY_MESSAGE,
    PR_PRINT_LOCK_STALE_MS,
    canClaimPrPrintLock,
    isPrPrintLockStale,
} from "./utils/print-lock-logic.js";

const PR_PRINT_LOCK_PATH = "printLocks/pr";
const HOLDER_STORAGE_KEY = "pr_print_lock_holder_v1";
const HEARTBEAT_MS = 8 * 1000;
const BUSY_RETRY_ATTEMPTS = 2;
const BUSY_RETRY_DELAY_MS = 400;
const BUSY_RELOAD_MS = 5 * 1000;

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
    return ref(getDatabaseInstance(), PR_PRINT_LOCK_PATH);
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
        console.warn("P&R print lock server time offset failed", err);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPrPrintLockHolderId() {
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
        void releasePrPrintLockIfHeld();
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("beforeunload", release);
}

async function cancelDisconnectHook() {
    if (!disconnectConfigured) return;
    try {
        await onDisconnect(getLockRef()).cancel();
    } catch (err) {
        console.warn("P&R print lock onDisconnect cancel failed", err);
    } finally {
        disconnectConfigured = false;
    }
}

async function configureDisconnectHook() {
    try {
        await onDisconnect(getLockRef()).remove();
        disconnectConfigured = true;
    } catch (err) {
        console.warn("P&R print lock onDisconnect setup failed", err);
        disconnectConfigured = false;
    }
}

async function renewLockHeartbeat() {
    if (!heldByUs) return;
    const epoch = releaseEpoch;
    const holderId = getPrPrintLockHolderId();
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
        console.warn("P&R print lock heartbeat failed", err);
    }
}

function startHeartbeat() {
    stopHeartbeat();
    ensurePageHideRelease();
    void renewLockHeartbeat();
    heartbeatTimer = setInterval(() => {
        void renewLockHeartbeat();
    }, HEARTBEAT_MS);
}

async function readLockValue() {
    const snap = await get(getLockRef());
    return snap.exists() ? snap.val() : null;
}

export async function releasePrPrintLockIfHeld() {
    ensureServerTimeOffset();
    releaseEpoch += 1;
    stopHeartbeat();
    heldByUs = false;
    const holderId = getPrPrintLockHolderId();
    const lockRef = getLockRef();
    try {
        const value = await readLockValue();
        if (!value) {
            await cancelDisconnectHook();
            return;
        }
        const ownsLock = String(value.holderId) === String(holderId);
        const stale = isPrPrintLockStale(value, nowMs());
        if (ownsLock || stale) {
            await remove(lockRef);
        }
    } catch (err) {
        console.warn("P&R print lock release failed", err);
    } finally {
        await cancelDisconnectHook();
    }
}

export async function clearOwnPrPrintLockOnStartup() {
    ensureServerTimeOffset();
    await releasePrPrintLockIfHeld();
    try {
        const value = await readLockValue();
        if (value && isPrPrintLockStale(value, nowMs())) {
            await remove(getLockRef());
        }
    } catch (err) {
        console.warn("P&R print lock stale purge failed", err);
    }
}

async function attemptAcquireOnce() {
    const holderId = getPrPrintLockHolderId();
    const lockRef = getLockRef();
    const now = nowMs();

    try {
        const existing = await readLockValue();
        if (
            existing &&
            String(existing.holderId) !== String(holderId) &&
            isPrPrintLockStale(existing, now)
        ) {
            await remove(lockRef);
        }
    } catch (err) {
        console.warn("P&R print lock stale pre-clear failed", err);
    }

    const result = await runTransaction(lockRef, (current) => {
        const claimNow = nowMs();
        if (
            !canClaimPrPrintLock(
                current,
                holderId,
                claimNow,
                PR_PRINT_LOCK_STALE_MS,
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
        return { ok: false, message: PR_PRINT_BUSY_MESSAGE };
    }

    const value =
        result.snapshot && typeof result.snapshot.val === "function"
            ? result.snapshot.val()
            : null;
    if (!value || String(value.holderId) !== String(holderId)) {
        return { ok: false, message: PR_PRINT_BUSY_MESSAGE };
    }

    heldByUs = true;
    await configureDisconnectHook();
    startHeartbeat();
    return { ok: true };
}

/**
 * Acquire the shared P&R print lock for this browser tab.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function acquirePrPrintLock() {
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
        return { ok: false, message: PR_PRINT_BUSY_MESSAGE };
    } catch (err) {
        console.warn(
            "P&R print lock acquire failed; continuing without lock",
            err,
        );
        heldByUs = false;
        stopHeartbeat();
        return { ok: true };
    }
}

/**
 * Show the busy message and reload after 5 seconds so this station can retry
 * once the active print finishes.
 */
export function notifyPrintBusyAndReload(message = PR_PRINT_BUSY_MESSAGE) {
    // Start the timer before alert so the 5s countdown is not blocked by the dialog.
    setTimeout(() => {
        window.location.reload();
    }, BUSY_RELOAD_MS);
    try {
        alert(message);
    } catch {
        // ignore environments without alert
    }
}

export { PR_PRINT_BUSY_MESSAGE };
