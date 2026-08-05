import test from "node:test";
import assert from "node:assert/strict";

import {
    PR_PRINT_BUSY_MESSAGE,
    PR_PRINT_LOCK_STALE_MS,
    canClaimPrPrintLock,
    isPrPrintLockStale,
} from "../modules/utils/print-lock-logic.js";

test("busy message matches operator-facing copy", () => {
    assert.equal(
        PR_PRINT_BUSY_MESSAGE,
        "One station is currently busy. Please wait...",
    );
});

test("empty lock can be claimed", () => {
    assert.equal(canClaimPrPrintLock(null, "a", 1000), true);
    assert.equal(canClaimPrPrintLock({}, "a", 1000), true);
});

test("same holder can re-claim", () => {
    assert.equal(
        canClaimPrPrintLock({ holderId: "a", renewedAt: 1000 }, "a", 1500),
        true,
    );
});

test("other holder is blocked while lock is fresh", () => {
    assert.equal(
        canClaimPrPrintLock(
            { holderId: "a", renewedAt: 1000 },
            "b",
            1000 + PR_PRINT_LOCK_STALE_MS,
        ),
        false,
    );
});

test("other holder can take over after stale timeout", () => {
    assert.equal(
        canClaimPrPrintLock(
            { holderId: "a", renewedAt: 1000 },
            "b",
            1000 + PR_PRINT_LOCK_STALE_MS + 1,
        ),
        true,
    );
});

test("isPrPrintLockStale treats missing timestamps as stale", () => {
    assert.equal(isPrPrintLockStale({ holderId: "a" }, 5000), true);
});
