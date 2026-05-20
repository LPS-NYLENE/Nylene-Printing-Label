import { state, showScreen } from "../state.js";
import { findLatestPrintRecordByUnit } from "../utils/print-records.js";
import {
    buildUnitNumberFromParts,
    normalizeUnitNumber,
    parseSourceFromPrefix,
} from "../utils/unit-number.js";
import {
    confirmYesNo,
    promptForLotNumber,
    promptForPassword,
} from "../utils/operator-prompts.js";

const REISSUE_FLAG = "RI";
const PASSWORD_EXPECTED = "Nylene2026!";
const COPERION_PREFIX = "EA";

function setFromRecord(record) {
    const unit = normalizeUnitNumber(record && record.unitNumber);
    const product = String(
        record && record.product ? record.product : "",
    ).trim();
    const sourceGroup = String(
        record && record.sourceGroup ? record.sourceGroup : "",
    ).toLowerCase();
    const sourceLetter = String(
        record && record.sourceLetter ? record.sourceLetter : "",
    ).toUpperCase();
    const special = record && record.special ? String(record.special) : null;

    state.isCoperion =
        String(record && record.productLine ? record.productLine : "") ===
            "Coperion" || unit.startsWith(COPERION_PREFIX);

    state.activeGroup = sourceGroup || null;
    if (sourceGroup && sourceLetter) state.source[sourceGroup] = sourceLetter;
    state.source.special = special || null;

    state.unitNumber = unit;
    state.bigCode = product;
    state.selectedProduct = product || null;
    state.weights = {
        netLb: Number(record && record.netLb ? record.netLb : 0),
        grossLb: Number(record && record.grossLb ? record.grossLb : 0),
        tareLb: Number(record && record.tareLb ? record.tareLb : 0),
    };
    state.previewTimestamp = null;
    state.reprintAvailable = false;
    state.lastPrinted = null;
    state.lockUnitNumberOnce = true;
}

function resetReissueNewState() {
    state.reissueFlag = "";
    state.reissueOriginalUnit = null;
    state.reissueFlowType = null;
    state.lockUnitNumberOnce = false;
}

function hoistSharedModals() {
    const appRoot = document.getElementById("app");
    if (!appRoot) return;
    [
        "reissueSearchModal",
        "reissueEditModal",
        "reissueNewModal",
        "operatorPasswordModal",
        "operatorLotModal",
        "operatorConfirmModal",
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.parentElement === appRoot) return;
        appRoot.appendChild(el);
    });
}

export function initReissueNewFlow() {
    hoistSharedModals();
    const buttons = [
        document.getElementById("btnReissueNew"),
        document.getElementById("btnReissueNewCoperion"),
    ].filter(Boolean);
    const modal = document.getElementById("reissueNewModal");
    const srcInput = document.getElementById("reissueNewSource");
    const yearInput = document.getElementById("reissueNewYear");
    const dayInput = document.getElementById("reissueNewDay");
    const boxInput = document.getElementById("reissueNewBox");
    const errEl = document.getElementById("reissueNewError");
    const clearBtn = document.getElementById("reissueNewClear");
    const manualBtn = document.getElementById("reissueNewManualEntry");
    const searchBtn = document.getElementById("reissueNewSearch");
    const sourceOptions = srcInput
        ? Array.from(srcInput.options).map((option) => ({
              value: option.value,
              label: option.textContent || "",
          }))
        : [];

    if (!buttons.length || !modal) return;

    const show = () => modal.classList.remove("hidden");
    const hide = () => modal.classList.add("hidden");
    const setError = (msg = "") => {
        if (errEl) errEl.textContent = msg;
    };

    function setSourceOptions(coperionOnly = false) {
        if (!srcInput) return;
        const allowedValues = coperionOnly
            ? new Set([COPERION_PREFIX])
            : null;
        srcInput.replaceChildren();
        sourceOptions
            .filter((option) =>
                allowedValues ? allowedValues.has(option.value) : true,
            )
            .forEach((option) => {
                const el = document.createElement("option");
                el.value = option.value;
                el.textContent = option.label;
                srcInput.appendChild(el);
            });
        srcInput.value = coperionOnly ? COPERION_PREFIX : "";
    }

    function openModal(coperionOnly = false) {
        resetReissueNewState();
        setError("");
        show();
        if (srcInput) {
            setSourceOptions(coperionOnly);
            srcInput.focus();
        }
        if (yearInput) yearInput.value = "";
        if (dayInput) dayInput.value = "";
        if (boxInput) boxInput.value = "";
    }

    function closeModal() {
        hide();
        setError("");
    }

    function applyPrefixContext(prefix) {
        const normalizedPrefix = normalizeUnitNumber(prefix).slice(0, 2);
        if (normalizedPrefix === COPERION_PREFIX) {
            state.isCoperion = true;
            state.activeGroup = "compound";
            state.source.compound = "A";
            state.source.special = null;
            return true;
        }
        const parsed = parseSourceFromPrefix(normalizedPrefix);
        if (!parsed) return false;
        state.isCoperion = false;
        state.activeGroup = parsed.group;
        state.source[parsed.group] = parsed.letter;
        state.source.special = null;
        return true;
    }

    async function startNewLabelFlow(unitNumber) {
        const prefix = normalizeUnitNumber(unitNumber).slice(0, 2);
        if (!applyPrefixContext(prefix)) {
            setError("Invalid source prefix in lot number.");
            return;
        }

        state.unitNumber = normalizeUnitNumber(unitNumber);
        state.lockUnitNumberOnce = true;
        state.reissueFlag = REISSUE_FLAG;
        state.reissueOriginalUnit = normalizeUnitNumber(unitNumber);
        state.reissueFlowType = "new";
        state.reprintAvailable = false;
        state.lastPrinted = null;

        closeModal();
        if (state.isCoperion) {
            showScreen("coperion");
            document.dispatchEvent(new CustomEvent("enterCoperion"));
            return;
        }
        showScreen("products");
        document.dispatchEvent(new CustomEvent("renderProductList"));
    }

    async function handleUnitAttempt(unitNumber) {
        const unit = normalizeUnitNumber(unitNumber);
        if (!unit) {
            setError("Enter a lot number.");
            return;
        }

        setError("");
        const record = await findLatestPrintRecordByUnit(unit);
        if (record) {
            // Existing label: no password required, reissue directly.
            setFromRecord(record);
            state.reissueFlag = REISSUE_FLAG;
            state.reissueOriginalUnit = normalizeUnitNumber(record.unitNumber);
            state.reissueFlowType = "existing";
            closeModal();
            document.dispatchEvent(new CustomEvent("updatePreview"));
            showScreen("preview");
            return;
        }

        const ok = await confirmYesNo({
            title: "Lot number not found",
            message: `Lot number not found. Continue with ${unit}?`,
            yesText: "Yes",
            noText: "No",
        });
        if (!ok) return;

        const authed = await promptForPassword({
            title: "Enter password",
            expected: PASSWORD_EXPECTED,
        });
        if (!authed) return;

        await startNewLabelFlow(unit);
    }

    async function handleSearchFromFields() {
        const built = buildUnitNumberFromParts({
            prefix: srcInput && srcInput.value,
            year: yearInput && yearInput.value,
            day: dayInput && dayInput.value,
            box: boxInput && boxInput.value,
        });
        if (!built.ok) {
            setError(built.error || "Invalid lot number details.");
            return;
        }
        await handleUnitAttempt(built.unitNumber);
    }

    async function handleManualEntry() {
        setError("");
        const lot = await promptForLotNumber({
            title: "Enter Lot number",
            initialValue: "",
        });
        if (!lot) return;
        await handleUnitAttempt(lot);
    }

    buttons.forEach((btn) => {
        btn.addEventListener("click", () =>
            openModal(btn.id === "btnReissueNewCoperion"),
        );
    });
    if (clearBtn)
        clearBtn.addEventListener("click", () => {
            closeModal();
            resetReissueNewState();
        });
    if (manualBtn)
        manualBtn.addEventListener("click", () => void handleManualEntry());
    if (searchBtn)
        searchBtn.addEventListener(
            "click",
            () => void handleSearchFromFields(),
        );
}
