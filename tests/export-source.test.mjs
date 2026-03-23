import test from "node:test";
import assert from "node:assert/strict";

import {
    resolveExcelSource,
    withExcelSource,
} from "../modules/utils/export-source.js";

test("resolveExcelSource marks EA unit numbers as Coperion", () => {
    assert.equal(
        resolveExcelSource({
            unitNumber: "ea15324003",
            product: "PA6-205",
        }),
        "Coperion"
    );
});

test("resolveExcelSource marks configured unit prefixes as P&R", () => {
    assert.equal(
        resolveExcelSource({
            unitNumber: "AD15324003",
            product: "PA6-205",
        }),
        "P&R"
    );
});

test("resolveExcelSource marks configured product prefixes as P&R", () => {
    assert.equal(
        resolveExcelSource({
            unitNumber: "ZZ15324003",
            product: "LT-BLEND",
        }),
        "P&R"
    );
});

test("resolveExcelSource falls back to the stored product line", () => {
    assert.equal(
        resolveExcelSource({
            unitNumber: "ZZ15324003",
            product: "PA6-205",
            productLine: "Coperion",
        }),
        "Coperion"
    );
});

test("withExcelSource appends the derived source field", () => {
    assert.deepEqual(
        withExcelSource({
            unitNumber: "BC15324003",
            product: "PA6-205",
        }),
        {
            unitNumber: "BC15324003",
            product: "PA6-205",
            source: "P&R",
        }
    );
});
