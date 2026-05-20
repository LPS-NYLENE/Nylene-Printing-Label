import test from "node:test";
import assert from "node:assert/strict";

import {
    selectLatestPrintRecordByFlow,
    selectLatestPrintRecordByUnit,
} from "../modules/utils/print-record-selection.js";

test("selectLatestPrintRecordByFlow returns the newest P&R record only", () => {
    const records = [
        {
            timestamp: "2026-04-15T09:00:00.000Z",
            unitNumber: "AD26001001",
            productLine: "P&R",
        },
        {
            timestamp: "2026-04-15T09:05:00.000Z",
            unitNumber: "EA26084001",
            productLine: "Coperion",
        },
        {
            timestamp: "2026-04-15T09:10:00.000Z",
            unitNumber: "BD26001002",
            productLine: "P&R",
        },
    ];

    assert.deepEqual(selectLatestPrintRecordByFlow(records, false), records[2]);
});

test("selectLatestPrintRecordByFlow returns the newest Coperion record only", () => {
    const records = [
        {
            timestamp: "2026-04-15T09:00:00.000Z",
            unitNumber: "AD26001001",
            productLine: "P&R",
        },
        {
            timestamp: "2026-04-15T09:05:00.000Z",
            unitNumber: "EA26084001",
            productLine: "P&R",
        },
        {
            timestamp: "2026-04-15T09:10:00.000Z",
            unitNumber: "BD26001002",
            productLine: "P&R",
        },
    ];

    assert.deepEqual(selectLatestPrintRecordByFlow(records, true), records[1]);
});

test("selectLatestPrintRecordByUnit returns the newest matching unit", () => {
    const records = [
        {
            timestamp: "2026-04-15T09:00:00.000Z",
            unitNumber: "AD26001001",
        },
        {
            timestamp: "2026-04-15T09:05:00.000Z",
            unitNumber: "BD26001002",
        },
        {
            timestamp: "2026-04-15T09:10:00.000Z",
            unitNumber: "ad26001001",
        },
    ];

    assert.deepEqual(
        selectLatestPrintRecordByUnit(records, " AD26001001 "),
        records[2],
    );
});
