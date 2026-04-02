import test from "node:test";
import assert from "node:assert/strict";

import {
    buildUnitNumberFromParts,
    parseSourceFromPrefix,
    normalizeUnitNumber,
} from "../modules/utils/unit-number.js";
import {
    getDayOfYear,
    getLabelDayContext,
} from "../modules/utils/label-rollover.js";

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

test("getDayOfYear advances correctly after spring DST change", () => {
    const justAfterMidnight = new Date("2026-04-02T00:11:00-04:00");

    assert.equal(getDayOfYear(justAfterMidnight), 92);
});

test("getLabelDayContext rolls over immediately at local midnight", () => {
    const context = getLabelDayContext(new Date("2026-04-02T00:00:00-04:00"));

    assert.equal(context.dayOfYear, 92);
    assert.equal(context.dayOfYearStr, "092");
    assert.equal(context.localDayKey, "2026-04-02");
});

