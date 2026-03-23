import test from "node:test";
import assert from "node:assert/strict";

import {
    buildPrintedSnapshotFromRecord,
    buildPrintedSnapshotFromState,
    inferIsCoperionFromRecord,
} from "../modules/utils/reprint-snapshot.js";

test("buildPrintedSnapshotFromState keeps the exact printed values", () => {
    const snapshot = buildPrintedSnapshotFromState(
        {
            unitNumber: "AD15324003",
            bigCode: "PA6-205",
            weights: { grossLb: 2100.5, netLb: 2000.5, tareLb: 100 },
            source: { silo: null, dryer: "A", compound: null, special: null },
            activeGroup: "dryer",
            isCoperion: false,
        },
        "2026-03-23T10:15:00.000Z",
    );

    assert.deepEqual(snapshot, {
        printedAt: "2026-03-23T10:15:00.000Z",
        unitNumber: "AD15324003",
        bigCode: "PA6-205",
        weights: { grossLb: 2100.5, netLb: 2000.5, tareLb: 100 },
        source: { silo: null, dryer: "A", compound: null, special: null },
        activeGroup: "dryer",
        isCoperion: false,
    });
});

test("buildPrintedSnapshotFromRecord rebuilds a snapshot from stored logs", () => {
    const snapshot = buildPrintedSnapshotFromRecord({
        timestamp: "2026-03-23T10:15:00.000Z",
        unitNumber: " ad15324003 ",
        product: "PA6-205",
        sourceGroup: "dryer",
        sourceLetter: "a",
        special: "",
        grossLb: "2100.5",
        netLb: "2000.5",
        tareLb: "100.0",
        productLine: "P&R",
    });

    assert.deepEqual(snapshot, {
        printedAt: "2026-03-23T10:15:00.000Z",
        unitNumber: "AD15324003",
        bigCode: "PA6-205",
        weights: { grossLb: 2100.5, netLb: 2000.5, tareLb: 100 },
        source: {
            silo: null,
            dryer: "A",
            compound: null,
            special: null,
        },
        activeGroup: "dryer",
        isCoperion: false,
    });
});

test("inferIsCoperionFromRecord recognizes Coperion records by product line or unit prefix", () => {
    assert.equal(
        inferIsCoperionFromRecord({
            productLine: "Coperion",
            unitNumber: "AD15324003",
        }),
        true,
    );

    assert.equal(
        inferIsCoperionFromRecord({
            productLine: "P&R",
            unitNumber: "EA15324003",
        }),
        true,
    );
});
