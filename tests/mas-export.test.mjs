import test from "node:test";
import assert from "node:assert/strict";

import {
    MAS_HEADER,
    buildMasHeaderAndRows,
    formatForMasExcel,
    formatMasTime,
    orderMasRecordsForExcel,
} from "../modules/utils/mas-export.js";

test("orderMasRecordsForExcel puts the newest label first", () => {
    const ordered = orderMasRecordsForExcel([
        { unitNumber: "AD16084001", timestamp: "2026-03-24T09:30:00.000Z" },
        { unitNumber: "AD16084003", timestamp: "2026-03-24T11:30:00.000Z" },
        { unitNumber: "AD16084002", timestamp: "2026-03-24T10:30:00.000Z" },
    ]);

    assert.deepEqual(
        ordered.map((record) => record.unitNumber),
        ["AD16084003", "AD16084002", "AD16084001"]
    );
});

test("formatMasTime returns 12-hour times with AM/PM", () => {
    assert.equal(formatMasTime(new Date(2026, 2, 24, 0, 5)), "12:05 AM");
    assert.equal(formatMasTime(new Date(2026, 2, 24, 13, 7)), "1:07 PM");
});

test("buildMasHeaderAndRows leaves column 4 empty and resumes in column 5", () => {
    const row = formatForMasExcel({
        timestamp: new Date(2026, 2, 24, 13, 7),
        product: "PA6-205",
        unitNumber: "AD16084003",
        grossLb: 2100,
        netLb: 2000,
        tareLb: 100,
        materialNumber: "10248654",
    });
    const sheet = buildMasHeaderAndRows([row]);

    assert.deepEqual(sheet[0], MAS_HEADER);
    assert.equal(sheet[0][3], "");
    assert.equal(sheet[1][3], "");
    assert.equal(sheet[1][4], "PA6-205");
    assert.equal(sheet[1][5], "AD16084003");
    assert.equal(sheet[1][6], "2100.0");
});
