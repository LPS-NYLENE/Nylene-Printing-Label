// Centralized UI access checks for privileged actions.

const EXCEL_ALLOWED_EMAIL = "lps@nylene.com";

export function isExcelExportAllowed(user) {
    const email = user && typeof user.email === "string" ? user.email : "";
    return email.trim().toLowerCase() === EXCEL_ALLOWED_EMAIL;
}

export function applyExcelButtonAccess(user) {
    const excelBtn = document.getElementById("excelBtn");
    if (!excelBtn) return;

    const allowed = isExcelExportAllowed(user);
    excelBtn.disabled = !allowed;
    // Hide the button entirely for non-allowed users.
    excelBtn.style.display = allowed ? "" : "none";
}

