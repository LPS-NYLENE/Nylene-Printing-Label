import test from "node:test";
import assert from "node:assert/strict";

import {
    buildUnitNumberFromParts,
    parseSourceFromPrefix,
    normalizeUnitNumber,
    shouldPreserveReissueUnitNumber,
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
    assert.equal(res.unitNumber, "AD25324003");
});

test("buildUnitNumberFromParts replaces only the year digits after any prefix", () => {
    assert.equal(
        buildUnitNumberFromParts({
            prefix: "AC",
            year: "2026",
            day: "365",
            box: "001",
        }).unitNumber,
        "AC26365001",
    );
    assert.equal(
        buildUnitNumberFromParts({
            prefix: "EA",
            year: "2027",
            day: "365",
            box: "401",
        }).unitNumber,
        "EA27365401",
    );
});

test("normalizeUnitNumber trims and uppercases", () => {
    assert.equal(normalizeUnitNumber(" ad25324003 "), "AD25324003");
});

test("shouldPreserveReissueUnitNumber recognizes active reissue state", () => {
    assert.equal(
        shouldPreserveReissueUnitNumber({ reissueFlowType: "new" }),
        true,
    );
    assert.equal(
        shouldPreserveReissueUnitNumber({ reissueFlag: "ri" }),
        true,
    );
    assert.equal(shouldPreserveReissueUnitNumber({}), false);
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
    assert.equal(context.yearDigits, "26");
    assert.equal(context.localDayKey, "2026-04-02");
});

test("getLabelDayContext uses the current year last two digits", () => {
    assert.equal(
        getLabelDayContext(new Date("2026-12-31T12:00:00-05:00")).yearDigits,
        "26",
    );
    assert.equal(
        getLabelDayContext(new Date("2027-01-01T12:00:00-05:00")).yearDigits,
        "27",
    );
});

