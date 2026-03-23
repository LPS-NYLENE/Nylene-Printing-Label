// Centralized UI access checks for privileged actions.

const EXCEL_ALLOWED_EMAIL = "lps@nylene.com";
const EXCEL_BUTTON_SELECTOR = "[data-excel-export-btn]";

export function isExcelExportAllowed(user) {
    const email = user && typeof user.email === "string" ? user.email : "";
    return email.trim().toLowerCase() === EXCEL_ALLOWED_EMAIL;
}

export function getExcelExportButtons() {
    return Array.from(document.querySelectorAll(EXCEL_BUTTON_SELECTOR));
}

export function applyExcelButtonAccess(user) {
    const excelButtons = getExcelExportButtons();
    if (!excelButtons.length) return;

    const allowed = isExcelExportAllowed(user);
    excelButtons.forEach((excelBtn) => {
        excelBtn.disabled = !allowed;
        // Hide the button entirely for non-allowed users.
        excelBtn.style.display = allowed ? "" : "none";
    });
}

