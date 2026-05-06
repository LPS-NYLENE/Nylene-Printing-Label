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

test("keeps regular products on one line", () => {
    assert.deepEqual(splitProductDisplayLines("BX3WQ662"), ["BX3WQ662"]);
});

test("falls back to em dash for blank product codes", () => {
    assert.deepEqual(splitProductDisplayLines("  "), ["—"]);
});
