import test from "node:test";
import assert from "node:assert/strict";

import {
    buildMasSheetData,
    buildObjectSheetData,
} from "../modules/utils/mas-excel.js";

test("buildMasSheetData keeps only date and time as formatted numeric cells", () => {
    const timestamp = "2026-03-25T15:42:30.000Z";
    const rows = [
        {
            timestamp,
            values: [0, "RI", "PA6-205", "AC15324003", "500.0", "450.0"],
        },
    ];

    const sheetData = buildMasSheetData(rows);

    assert.equal(sheetData[0][0].t, "s");
    assert.equal(sheetData[0][0].z, "@");

    assert.equal(sheetData[1][0].t, "n");
    assert.equal(sheetData[1][0].z, "mm/dd/yy");
    assert.equal(sheetData[1][1].t, "n");
    assert.equal(sheetData[1][1].z, "h:mm AM/PM");

    for (const cell of sheetData[1].slice(2)) {
        assert.equal(cell.t, "s");
        assert.equal(cell.z, "@");
    }
});

test("buildObjectSheetData keeps non-datetime fields as text", () => {
    const rows = [
        {
            timestamp: "2026-03-25T15:42:30.000Z",
            unitNumber: "00123",
            grossLb: 500,
            source: "P&R",
        },
    ];

    const sheetData = buildObjectSheetData(rows, {
        typeMap: { timestamp: "datetime" },
    });

    assert.equal(sheetData[0][0].t, "s");
    assert.equal(sheetData[1][0].t, "n");
    assert.equal(sheetData[1][0].z, "mm/dd/yy h:mm AM/PM");

    assert.deepEqual(
        sheetData[1].slice(1).map((cell) => ({
            type: cell.t,
            format: cell.z,
            value: cell.v,
        })),
        [
            { type: "s", format: "@", value: "00123" },
            { type: "s", format: "@", value: "500" },
            { type: "s", format: "@", value: "P&R" },
        ]
    );
});
