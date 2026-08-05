import { state } from "./state.js";
import {
    claimUnitNumberFromFirebase,
    claimCompoundBagsUnitNumberFromFirebase,
    releaseClaimedUnitNumber,
} from "./utils/generators.js";

const RESERVATION_STORAGE_KEY = "pr_preview_reservation_v1";

function readStoredReservation() {
    try {
        const raw = sessionStorage.getItem(RESERVATION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.unitNumber || !parsed.pool) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeStoredReservation(reservation) {
    try {
        if (!reservation) {
            sessionStorage.removeItem(RESERVATION_STORAGE_KEY);
            return;
        }
        sessionStorage.setItem(
            RESERVATION_STORAGE_KEY,
            JSON.stringify(reservation),
        );
    } catch {
        // ignore storage failures
    }
}

function setActiveReservation(reservation) {
    state.__reservedSequence = reservation || null;
    writeStoredReservation(reservation);
}

export function getActiveReservation() {
    if (state.__reservedSequence?.unitNumber) return state.__reservedSequence;
    const stored = readStoredReservation();
    if (stored) state.__reservedSequence = stored;
    return stored;
}

/** Keep the reserved suffix after a successful print (do not free it). */
export function commitPrReservation() {
    const active = getActiveReservation();
    if (!active) return;
    setActiveReservation({ ...active, committed: true });
}

/**
 * Free an abandoned preview reservation so another station can reuse the
 * last-3 digits. No-op after a successful print commit.
 */
export async function releaseAbandonedPrReservation() {
    const active = getActiveReservation();
    setActiveReservation(null);
    if (!active || active.committed) return;
    try {
        await releaseClaimedUnitNumber(active.pool, active.unitNumber);
    } catch (err) {
        console.warn("Failed to release abandoned box-number reservation", err);
    }
}

function isCompoundBagsContext(activeGroup, productCode) {
    const group = String(activeGroup || "").toLowerCase();
    if (group !== "compound") return false;
    return String(productCode || "")
        .trim()
        .toLowerCase()
        .endsWith("bags");
}

/**
 * Reserve (or reuse) a P&R / BAGS unit number for the current preview context.
 * Coperion and reissue flows should not call this.
 */
export async function reserveUnitNumberForPreview({
    group,
    letter,
    product,
    contextKey,
}) {
    const existing = getActiveReservation();
    if (
        existing &&
        !existing.committed &&
        existing.contextKey === contextKey &&
        existing.unitNumber
    ) {
        return existing.unitNumber;
    }

    if (existing && !existing.committed) {
        await releaseAbandonedPrReservation();
    }

    const bags = isCompoundBagsContext(group, product);
    const claimed = bags
        ? await claimCompoundBagsUnitNumberFromFirebase(group, letter)
        : await claimUnitNumberFromFirebase(group, letter);

    setActiveReservation({
        ...claimed,
        contextKey,
        committed: false,
    });
    return claimed.unitNumber;
}
