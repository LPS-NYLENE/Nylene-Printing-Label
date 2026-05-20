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
                // unitNumber: "EA26091417",
                unitNumber: "EA16091417",
                reissueFlag: "",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA26092" },
    );

    assert.equal(next, 401);
});
