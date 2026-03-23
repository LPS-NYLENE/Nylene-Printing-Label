import test from "node:test";
import assert from "node:assert/strict";

import {
    LOGIN_PASSWORD,
    OPERATOR_PASSWORD,
    matchesPasswordCaseInsensitive,
    normalizeLoginPassword,
} from "../modules/utils/passwords.js";

test("operator password matches regardless of case", () => {
    assert.equal(
        matchesPasswordCaseInsensitive("nylene2026!", OPERATOR_PASSWORD),
        true,
    );
    assert.equal(
        matchesPasswordCaseInsensitive("NyLeNe2026!", OPERATOR_PASSWORD),
        true,
    );
});

test("operator password comparison trims surrounding whitespace", () => {
    assert.equal(
        matchesPasswordCaseInsensitive("  nylene2026!  ", OPERATOR_PASSWORD),
        true,
    );
});

test("login password normalizes case variants to the canonical Firebase credential", () => {
    assert.equal(normalizeLoginPassword("!p5ckout"), LOGIN_PASSWORD);
    assert.equal(normalizeLoginPassword("!P5CKOUT"), LOGIN_PASSWORD);
});

test("login password normalization preserves non-matching input exactly", () => {
    assert.equal(normalizeLoginPassword(" !p5ckout "), " !p5ckout ");
});
