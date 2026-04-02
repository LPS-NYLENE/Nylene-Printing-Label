import test from "node:test";
import assert from "node:assert/strict";

import {
    getNextPrSequenceFromRecords,
    getNextCoperionSequenceFromRecords,
    getNextCompoundBagsSequenceFromRecords,
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
        { coperionPrefixForDay: "EA16084" },
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
                unitNumber: "AD16084001",
                reissueFlag: "",
                productLine: "P&R",
            },
        ],
        { coperionPrefixForDay: "EA16084" },
    );

    assert.equal(next, 2);
});

test("Coperion sequence ignores RI labels before the first regular box of the day", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA16084401",
                reissueFlag: "RI",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA16084" },
    );

    assert.equal(next, 401);
});

test("Coperion sequence continues from regular boxes only", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA16084401",
                reissueFlag: "",
                productLine: "Coperion",
            },
            {
                unitNumber: "EA16084402",
                reissueFlag: "RI",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA16084" },
    );

    assert.equal(next, 402);
});

test("Compound bags sequence ignores RI labels before the first regular box of the day", () => {
    const next = getNextCompoundBagsSequenceFromRecords([
        {
            unitNumber: "AC16084201",
            reissueFlag: "RI",
            sourceGroup: "compound",
            product: "NYLON BAGS",
        },
    ]);

    assert.equal(next, 201);
});

test("P&R sequence ignores same-day Coperion prefixes when computing the next suffix", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AS16092017",
                reissueFlag: "",
                productLine: "P&R",
            },
            {
                unitNumber: "EA16092417",
                reissueFlag: "",
                productLine: "Coperion",
            },
        ],
        { coperionPrefixForDay: "EA16092" },
    );

    assert.equal(next, 18);
});

test("Coperion sequence restarts at 401 for a new day prefix", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA16091417",
                reissueFlag: "",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA16092" },
    );

    assert.equal(next, 401);
});
