import test from "node:test";
import assert from "node:assert/strict";

import {
    getNextPrSequenceFromRecords,
    getNextCoperionSequenceFromRecords,
    getNextCompoundBagsSequenceFromRecords,
    getLastPrSequenceFromRecords,
    getLastCoperionSequenceFromRecords,
    getLastCompoundBagsSequenceFromRecords,
    nextClaimedSequence,
} from "../modules/utils/daily-sequence.js";

test("P&R sequence ignores RI labels before the first regular box of the day", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AD14291019",
                reissueFlag: "RI",
                productLine: "P&R",
            },
        ],
        { coperionPrefixForDay: "EA26084" },
    );

    assert.equal(next, 1);
});

test("P&R sequence continues from regular boxes only", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AD14291019",
                reissueFlag: "RI",
                productLine: "P&R",
            },
            {
                unitNumber: "AD26084001",
                reissueFlag: "",
                productLine: "P&R",
            },
        ],
        { coperionPrefixForDay: "EA26084" },
    );

    assert.equal(next, 2);
});

test("Coperion sequence ignores RI labels before the first regular box of the day", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA26084401",
                reissueFlag: "RI",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA26084" },
    );

    assert.equal(next, 401);
});

test("Coperion sequence continues from regular boxes only", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA26084401",
                reissueFlag: "",
                productLine: "Coperion",
            },
            {
                unitNumber: "EA26084402",
                reissueFlag: "RI",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA26084" },
    );

    assert.equal(next, 402);
});

test("Coperion sequence continues from legacy year digits on the same day", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA16365409",
                reissueFlag: "",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA26365" },
    );

    assert.equal(next, 410);
});

test("Compound bags sequence ignores RI labels before the first regular box of the day", () => {
    const next = getNextCompoundBagsSequenceFromRecords([
        {
            unitNumber: "AC26084201",
            reissueFlag: "RI",
            sourceGroup: "compound",
            product: "NYLON BAGS",
        },
    ]);

    assert.equal(next, 201);
});

test("Compound bags sequence continues from regular bag records only", () => {
    const next = getNextCompoundBagsSequenceFromRecords([
        {
            unitNumber: "BC26145003",
            reissueFlag: "",
            sourceGroup: "compound",
            product: "BX3WQ662X",
        },
        {
            unitNumber: "BC26145201",
            reissueFlag: "",
            sourceGroup: "compound",
            product: "BX3WQ662XBAGS",
        },
    ]);

    assert.equal(next, 202);
});

test("P&R sequence ignores same-day Coperion prefixes when computing the next suffix", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AS26092017",
                reissueFlag: "",
                productLine: "P&R",
            },
            {
                unitNumber: "EA26092417",
                reissueFlag: "",
                productLine: "Coperion",
            },
        ],
        { coperionPrefixForDay: "EA26092" },
    );

    assert.equal(next, 18);
});

test("P&R sequence ignores same-day legacy Coperion prefixes", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AS26092017",
                reissueFlag: "",
                productLine: "P&R",
            },
            {
                unitNumber: "EA16092417",
                reissueFlag: "",
                productLine: "",
            },
        ],
        { coperionPrefixForDay: "EA26092" },
    );

    assert.equal(next, 18);
});

test("Coperion sequence restarts at 401 for a new day prefix", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                // unitNumber: "EA2609141",
                unitNumber: "EA16091417",
                reissueFlag: "",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA26092" },
    );

    assert.equal(next, 401);
});

test("getLast helpers return startAt - 1 when a pool has no regular prints", () => {
    assert.equal(
        getLastPrSequenceFromRecords([], { coperionPrefixForDay: "EA26084" }),
        0,
    );
    assert.equal(
        getLastCoperionSequenceFromRecords([], { prefix: "EA26084" }),
        400,
    );
    assert.equal(getLastCompoundBagsSequenceFromRecords([]), 200);
});

test("getLast helpers ignore RI and other pools", () => {
    const records = [
        {
            unitNumber: "AD26084005",
            reissueFlag: "RI",
            productLine: "P&R",
        },
        {
            unitNumber: "AD26084003",
            reissueFlag: "",
            productLine: "P&R",
        },
        {
            unitNumber: "AC26084201",
            reissueFlag: "",
            sourceGroup: "compound",
            product: "NYLON BAGS",
        },
        {
            unitNumber: "EA26084405",
            reissueFlag: "",
            productLine: "Coperion",
        },
    ];

    assert.equal(
        getLastPrSequenceFromRecords(records, {
            coperionPrefixForDay: "EA26084",
        }),
        3,
    );
    assert.equal(
        getLastCoperionSequenceFromRecords(records, { prefix: "EA26084" }),
        405,
    );
    assert.equal(getLastCompoundBagsSequenceFromRecords(records), 201);
});

test("nextClaimedSequence seeds from print history on first claim", () => {
    assert.equal(nextClaimedSequence(null, 0), 1);
    assert.equal(nextClaimedSequence(null, 3), 4);
    assert.equal(nextClaimedSequence(null, 400), 401);
    assert.equal(nextClaimedSequence(null, 200), 201);
});

test("nextClaimedSequence advances from the higher of counter and seed", () => {
    assert.equal(nextClaimedSequence(5, 3), 6);
    assert.equal(nextClaimedSequence(5, 8), 9);
    assert.equal(nextClaimedSequence(201, 200), 202);
});

test("nextClaimedSequence never skips when two callers race with the same seed", () => {
    // Simulate two machines both seeding from printed max=2.
    // First transaction wins with 3; second sees current=3 and gets 4.
    const first = nextClaimedSequence(null, 2);
    const second = nextClaimedSequence(first, 2);
    assert.equal(first, 3);
    assert.equal(second, 4);
});

test("nextClaimedSequence returns null when the day is exhausted", () => {
    assert.equal(nextClaimedSequence(999, 999), null);
    assert.equal(nextClaimedSequence(null, 999), null);
});
