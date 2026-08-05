import {
    getDatabase,
    ref,
    runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAppInstance } from "./firebase-db.js";
import { showScreen } from "./state.js";
import {
    PR_PREVIEW_BUSY_MESSAGE,
    PR_PREVIEW_LOCK_STALE_MS,
    canClaimPrPreviewLock,
} from "./utils/preview-lock-logic.js";

const PR_PREVIEW_LOCK_PATH = "previewLocks/pr";
const HOLDER_STORAGE_KEY = "pr_preview_lock_holder_v1";
const HEARTBEAT_MS = 20 * 1000;

let heartbeatTimer = null;
let pageHideBound = false;
let heldByUs = false;

function getDatabaseInstance() {
    return getDatabase(getAppInstance());
}

function getLockRef() {
    return ref(getDatabaseInstance(), PR_PREVIEW_LOCK_PATH);
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
    window.addEventListener("pagehide", () => {
        void releasePrPreviewLockIfHeld();
    });
}

async function renewLockHeartbeat() {
    if (!heldByUs) return;
    const holderId = getPrPreviewLockHolderId();
    const now = Date.now();
    try {
        const result = await runTransaction(getLockRef(), (current) => {
            if (!current || String(current.holderId) !== String(holderId)) {
                return;
            }
            return {
                holderId,
                heldAt: current.heldAt || now,
                renewedAt: now,
            };
        });
        if (!result.committed) {
            heldByUs = false;
            stopHeartbeat();
        }
    } catch (err) {
        console.warn("P&R preview lock heartbeat failed", err);
    }
}

function startHeartbeat() {
    stopHeartbeat();
    ensurePageHideRelease();
    heartbeatTimer = setInterval(() => {
        void renewLockHeartbeat();
    }, HEARTBEAT_MS);
}

/**
 * Acquire the shared P&R preview lock for this browser tab.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function acquirePrPreviewLock() {
    const holderId = getPrPreviewLockHolderId();
    const lockRef = getLockRef();
    const now = Date.now();

    try {
        const result = await runTransaction(lockRef, (current) => {
            if (
                !canClaimPrPreviewLock(
                    current,
                    holderId,
                    now,
                    PR_PREVIEW_LOCK_STALE_MS,
                )
            ) {
                return;
            }
            return {
                holderId,
                heldAt:
                    current && String(current.holderId) === String(holderId)
                        ? current.heldAt || now
                        : now,
                renewedAt: now,
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
        startHeartbeat();
        return { ok: true };
    } catch (err) {
        // Fail open on transport/rules errors so a Firebase outage (or undeployed
        // rules) does not freeze every P&R station. Busy is only returned when
        // another holder is confirmed via a completed transaction.
        console.warn("P&R preview lock acquire failed; continuing without lock", err);
        heldByUs = false;
        stopHeartbeat();
        return { ok: true };
    }
}

/**
 * Release the P&R preview lock if this tab currently holds it.
 */
export async function releasePrPreviewLockIfHeld() {
    if (!heldByUs) {
        stopHeartbeat();
        return;
    }
    const holderId = getPrPreviewLockHolderId();
    const lockRef = getLockRef();
    stopHeartbeat();
    heldByUs = false;
    try {
        await runTransaction(lockRef, (current) => {
            if (!current || String(current.holderId) !== String(holderId)) {
                return;
            }
            return null;
        });
    } catch (err) {
        console.warn("P&R preview lock release failed", err);
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
