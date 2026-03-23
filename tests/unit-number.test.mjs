import test from "node:test";
import assert from "node:assert/strict";

import {
    buildUnitNumberFromParts,
    parseSourceFromPrefix,
    normalizeUnitNumber,
} from "../modules/utils/unit-number.js";

test("parseSourceFromPrefix maps AD to dryer A", () => {
    assert.deepEqual(parseSourceFromPrefix("ad"), { group: "dryer", letter: "A" });
});

test("parseSourceFromPrefix maps UX to special source", () => {
    assert.deepEqual(parseSourceFromPrefix("UX"), { group: "other", letter: "UX" });
});

test("buildUnitNumberFromParts builds expected unit number", () => {
    const res = buildUnitNumberFromParts({
        prefix: "AD",
        year: "2025",
        day: "324",
        box: "003",
    });
    assert.equal(res.ok, true);
    assert.equal(res.unitNumber, "AD15324003");
});

test("normalizeUnitNumber trims and uppercases", () => {
    assert.equal(normalizeUnitNumber(" ad15324003 "), "AD15324003");
});

test("buildUnitNumberFromParts rejects invalid day", () => {
    const res = buildUnitNumberFromParts({
        prefix: "AD",
        year: "2025",
        day: "999",
        box: "003",
    });
    assert.equal(res.ok, false);
});

