import test from "node:test";
import assert from "node:assert/strict";

import {
    getNextPrSequenceFromRecords,
    getNextCoperionSequenceFromRecords,
    getNextCompoundBagsSequenceFromRecords,
} from "../modules/utils/daily-sequence.js";

test("P&R sequence ignores other-day RI labels before the first regular box of the day", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AD14291019",
                reissueFlag: "RI",
                productLine: "P&R",
            },
        ],
        { coperionPrefixForDay: "EA26084", labelDayDigits: "26084" },
    );

    assert.equal(next, 1);
});

test("P&R sequence continues from regular boxes only when RI is other-day", () => {
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
        { coperionPrefixForDay: "EA26084", labelDayDigits: "26084" },
    );

    assert.equal(next, 2);
});

test("P&R sequence advances past same-day RI so suffixes are not reused", () => {
    // BS26196020 was printed as a reissue; a new AC label must not reuse 020.
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "BS26196020",
                reissueFlag: "RI",
                productLine: "P&R",
                sourceGroup: "silo",
            },
        ],
        { coperionPrefixForDay: "EA26196", labelDayDigits: "26196" },
    );

    assert.equal(next, 21);
});

test("P&R sequence uses the higher of regular and same-day RI suffixes", () => {
    const next = getNextPrSequenceFromRecords(
        [
            {
                unitNumber: "AD26196019",
                reissueFlag: "",
                productLine: "P&R",
            },
            {
                unitNumber: "BS26196020",
                reissueFlag: "RI",
                productLine: "P&R",
                sourceGroup: "silo",
            },
        ],
        { coperionPrefixForDay: "EA26196", labelDayDigits: "26196" },
    );

    assert.equal(next, 21);
});

test("Coperion sequence ignores other-day RI labels before the first regular box", () => {
    const next = getNextCoperionSequenceFromRecords(
        [
            {
                unitNumber: "EA14291401",
                reissueFlag: "RI",
                productLine: "Coperion",
            },
        ],
        { prefix: "EA26084" },
    );

    assert.equal(next, 401);
});

test("Coperion sequence advances past same-day RI suffixes", () => {
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

    assert.equal(next, 402);
});

test("Coperion sequence continues from regular and same-day RI boxes", () => {
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

    assert.equal(next, 403);
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

test("Compound bags sequence ignores other-day RI labels before the first regular box", () => {
    const next = getNextCompoundBagsSequenceFromRecords(
        [
            {
                unitNumber: "AC14291201",
                reissueFlag: "RI",
                sourceGroup: "compound",
                product: "NYLON BAGS",
            },
        ],
        { labelDayDigits: "26084" },
    );

    assert.equal(next, 201);
});

test("Compound bags sequence advances past same-day RI suffixes", () => {
    const next = getNextCompoundBagsSequenceFromRecords(
        [
            {
                unitNumber: "AC26084201",
                reissueFlag: "RI",
                sourceGroup: "compound",
                product: "NYLON BAGS",
            },
        ],
        { labelDayDigits: "26084" },
    );

    assert.equal(next, 202);
});

test("Compound bags sequence continues from regular bag records only", () => {
    const next = getNextCompoundBagsSequenceFromRecords(
        [
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
        ],
        { labelDayDigits: "26145" },
    );

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
        { coperionPrefixForDay: "EA26092", labelDayDigits: "26092" },
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
        { coperionPrefixForDay: "EA26092", labelDayDigits: "26092" },
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
        { prefix: "EA26092" },
    );

    assert.equal(next, 401);
});
