import test from "node:test";
import assert from "node:assert/strict";

import {
    PR_PREVIEW_BUSY_MESSAGE,
    PR_PREVIEW_LOCK_STALE_MS,
    canClaimPrPreviewLock,
} from "../modules/utils/preview-lock-logic.js";

test("busy message matches operator-facing copy", () => {
    assert.equal(PR_PREVIEW_BUSY_MESSAGE, "One station currently busy");
});

test("empty lock can be claimed", () => {
    assert.equal(canClaimPrPreviewLock(null, "a", 1000), true);
    assert.equal(canClaimPrPreviewLock({}, "a", 1000), true);
});

test("same holder can re-claim", () => {
    assert.equal(
        canClaimPrPreviewLock(
            { holderId: "a", renewedAt: 1000 },
            "a",
            1500,
        ),
        true,
    );
});

test("other holder is blocked while lock is fresh", () => {
    assert.equal(
        canClaimPrPreviewLock(
            { holderId: "a", renewedAt: 1000 },
            "b",
            1000 + PR_PREVIEW_LOCK_STALE_MS,
        ),
        false,
    );
});

test("other holder can take over after stale timeout", () => {
    assert.equal(
        canClaimPrPreviewLock(
            { holderId: "a", renewedAt: 1000 },
            "b",
            1000 + PR_PREVIEW_LOCK_STALE_MS + 1,
        ),
        true,
    );
});

test("stale timeout is 30 seconds for stuck-lock recovery", () => {
    assert.equal(PR_PREVIEW_LOCK_STALE_MS, 30 * 1000);
});
