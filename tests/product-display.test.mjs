import test from "node:test";
import assert from "node:assert/strict";

import { splitProductDisplayLines } from "../modules/utils/product-display.js";

test("renders compound bags suffix on a second line", () => {
    assert.deepEqual(splitProductDisplayLines("BX3WQ662XBAGS"), [
        "BX3WQ662X",
        "BAGS",
    ]);
});

test("renders graded bags suffix on the bags line", () => {
    assert.deepEqual(splitProductDisplayLines("BX3WQ662X-02BAGS"), [
        "BX3WQ662X",
        "-02BAGS",
    ]);
});

test("renders graded suffix on a second line", () => {
    assert.deepEqual(splitProductDisplayLines("BX3WQ662X-01"), [
        "BX3WQ662X",
        "-01",
    ]);
});

test("treats listed two-line product names as multiline", () => {
    const twoLineProducts = [
        "BX3WQ662X-01",
        "BX3WQ662X-02",
        "BX3WQ662XBAGS",
        "BX3RF-01",
        "BX3WQ662X-02BAGS",
        "406C-NAT-BAGS",
    ];
    for (const code of twoLineProducts) {
        assert.ok(
            splitProductDisplayLines(code).length > 1,
            `${code} should render on two lines`,
        );
    }
});

test("keeps compact product names on one line", () => {
    assert.deepEqual(splitProductDisplayLines("BX3WQ662"), ["BX3WQ662"]);
    assert.deepEqual(splitProductDisplayLines("INT-190"), ["INT-190"]);
    assert.deepEqual(splitProductDisplayLines("BX3RF"), ["BX3RF"]);
});

test("falls back to em dash for blank product codes", () => {
    assert.deepEqual(splitProductDisplayLines("  "), ["—"]);
});
