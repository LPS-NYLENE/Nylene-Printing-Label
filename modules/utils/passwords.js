export const LOGIN_PASSWORD = "!P5ckout";
export const OPERATOR_PASSWORD = "Nylene2026!";

function normalizePassword(value, { trim = true } = {}) {
    const stringValue = String(value ?? "");
    return (trim ? stringValue.trim() : stringValue).toLowerCase();
}

export function matchesPasswordCaseInsensitive(
    input,
    expected,
    { trim = true } = {},
) {
    return normalizePassword(input, { trim }) === normalizePassword(expected, { trim });
}

export function normalizeLoginPassword(input) {
    return matchesPasswordCaseInsensitive(input, LOGIN_PASSWORD, { trim: false })
        ? LOGIN_PASSWORD
        : String(input ?? "");
}
