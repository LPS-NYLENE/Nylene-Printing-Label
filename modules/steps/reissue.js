import { state, showScreen } from "../state.js";
import { parseNumber } from "../utils/format.js";
import { findLatestPrintRecordByUnit } from "../utils/print-records.js";
import {
    COPERION_PRODUCT_CHOICES,
    PR_PRODUCT_CHOICES,
} from "../catalog/product-choices.js";

const REISSUE_FLAG = "RI";

export function initReissueFlow() {
    const reissueBtn = document.getElementById("btnReissue");
    const searchModal = document.getElementById("reissueSearchModal");
    const searchInput = document.getElementById("reissueBoxSearch");
    const searchBtn = document.getElementById("reissueSearchBtn");
    const cancelSearchBtn = document.getElementById("reissueCancelSearch");
    const searchError = document.getElementById("reissueSearchError");

    const editModal = document.getElementById("reissueEditModal");
    const editUnitNumber = document.getElementById("reissueUnitNumber");
    const editProduct = document.getElementById("reissueProduct");
    const editNet = document.getElementById("reissueNet");
    const editGross = document.getElementById("reissueGross");
    const editTare = document.getElementById("reissueTare");
    const editOriginal = document.getElementById("reissueOriginalBox");
    const editSourceMeta = document.getElementById("reissueSourceMeta");
    const editError = document.getElementById("reissueEditError");
    const confirmEditBtn = document.getElementById("reissueConfirm");
    const cancelEditBtn = document.getElementById("reissueCancelEdit");

    if (!reissueBtn) return;

    let activeRecord = null;

    function normalizeUnit(value) {
        return String(value || "").trim().toUpperCase();
    }

    function isCoperionRecord(record) {
        const productLine = String(record?.productLine || "");
        const unit = normalizeUnit(record?.unitNumber || "");
        return productLine === "Coperion" || unit.startsWith("EA1");
    }

    function setReissueProductOptions({ isCoperion, currentValue }) {
        if (!editProduct) return;
        const current = String(currentValue || "").trim();
        const base = isCoperion ? COPERION_PRODUCT_CHOICES : PR_PRODUCT_CHOICES;

        // Ensure current value is selectable even if it's not in the current list.
        const seen = new Set();
        const choices = [];
        [current, ...base].forEach((p) => {
            const value = String(p || "").trim();
            if (!value) return;
            if (seen.has(value)) return;
            seen.add(value);
            choices.push(value);
        });

        editProduct.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a product…";
        placeholder.disabled = true;
        editProduct.appendChild(placeholder);

        choices.forEach((prod) => {
            const opt = document.createElement("option");
            opt.value = prod;
            opt.textContent = prod;
            editProduct.appendChild(opt);
        });

        editProduct.value = current && seen.has(current) ? current : "";
    }

    function resetReissueState() {
        state.reissueFlag = "";
        state.reissueOriginalUnit = null;
        state.reissueFlowType = null;
        state.lockUnitNumberOnce = false;
    }

    function setSearchError(message = "") {
        if (searchError) searchError.textContent = message;
    }

    function setEditError(message = "") {
        if (editError) editError.textContent = message;
    }

    function openSearchModal() {
        if (!searchModal) return;
        resetReissueState();
        setSearchError("");
        searchModal.classList.remove("hidden");
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
    }

    function closeSearchModal() {
        if (!searchModal) return;
        searchModal.classList.add("hidden");
    }

    function openEditModal(record) {
        if (!editModal) return;
        activeRecord = record;
        setEditError("");
        editModal.classList.remove("hidden");
        if (editOriginal)
            editOriginal.textContent = `Original box: ${record.unitNumber || ""}`;
        if (editSourceMeta)
            editSourceMeta.textContent = buildSourceMeta(record);
        if (editUnitNumber) editUnitNumber.value = record.unitNumber || "";
        setReissueProductOptions({
            isCoperion: isCoperionRecord(record),
            currentValue: record.product || "",
        });
        if (editNet) editNet.value = String(record.netLb ?? "");
        if (editGross) editGross.value = String(record.grossLb ?? "");
        updateTareFromInputs();
        if (editProduct) editProduct.focus();
    }

    function closeEditModal() {
        if (!editModal) return;
        editModal.classList.add("hidden");
        activeRecord = null;
    }

    function buildSourceMeta(record) {
        const group = String(record.sourceGroup || "").toUpperCase();
        const letter = String(record.sourceLetter || "").toUpperCase();
        const special = record.special ? ` (${record.special})` : "";
        if (group && letter) return `${group} ${letter}${special}`;
        if (special) return `SPECIAL${special}`;
        return "Source not available";
    }

    function updateTareFromInputs() {
        if (!editTare) return;
        const net = parseNumber(editNet?.value || "");
        const gross = parseNumber(editGross?.value || "");
        if (editNet?.value && editGross?.value) {
            const tare = +(gross - net).toFixed(1);
            editTare.value = Number.isFinite(tare) ? String(tare) : "";
        } else {
            editTare.value = "";
        }
    }

    async function handleSearch() {
        const input = normalizeUnit(searchInput?.value || "");
        if (!input) {
            setSearchError("Enter a box number.");
            return;
        }
        setSearchError("");
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.textContent = "Searching...";
        }
        const record = await findLatestPrintRecordByUnit(input);
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.textContent = "Search";
        }
        if (!record) {
            setSearchError("No record found for that box number.");
            return;
        }
        closeSearchModal();
        openEditModal(record);
    }

    async function handleConfirmEdit() {
        if (!activeRecord) return;
        const unit = normalizeUnit(editUnitNumber?.value || "");
        const product = String(editProduct?.value || "").trim();
        const netRaw = String(editNet?.value || "").trim();
        const grossRaw = String(editGross?.value || "").trim();
        if (!unit) {
            setEditError("Enter a box number.");
            return;
        }
        if (!product) {
            setEditError("Enter a product.");
            return;
        }
        if (!netRaw || !grossRaw) {
            setEditError("Enter net and gross weights.");
            return;
        }
        const net = parseNumber(netRaw);
        const gross = parseNumber(grossRaw);
        if (gross < net) {
            setEditError("Gross weight must be greater than net weight.");
            return;
        }

        const sourceGroup = String(activeRecord.sourceGroup || "").toLowerCase();
        const sourceLetter = String(activeRecord.sourceLetter || "").toUpperCase();
        const originalUnit = String(activeRecord.unitNumber || "");
        const productLine = String(activeRecord.productLine || "");
        const isCoperion =
            productLine === "Coperion" || normalizeUnit(originalUnit).startsWith("EA1");

        if (!isCoperion && (!sourceGroup || !sourceLetter)) {
            setEditError("Source information is missing for this label.");
            return;
        }

        const newUnit = unit;

        state.isCoperion = isCoperion;
        if (sourceGroup) state.activeGroup = sourceGroup;
        if (sourceGroup)
            state.source[sourceGroup] = sourceLetter || state.source[sourceGroup];
        state.source.special = activeRecord.special || null;
        state.bigCode = product;
        state.selectedProduct = product;
        state.weights = {
            netLb: net,
            grossLb: gross,
            tareLb: +(gross - net).toFixed(1),
        };
        state.unitNumber = newUnit;
        state.previewTimestamp = null;
        state.reissueFlag = REISSUE_FLAG;
        state.reissueOriginalUnit = originalUnit || null;
        state.reissueFlowType = "existing";
        state.lockUnitNumberOnce = true;
        state.reprintAvailable = false;
        state.lastPrinted = null;

        closeEditModal();
        document.dispatchEvent(new CustomEvent("updatePreview"));
        showScreen("preview");
    }

    reissueBtn.addEventListener("click", () => {
        openSearchModal();
    });

    if (cancelSearchBtn)
        cancelSearchBtn.addEventListener("click", () => {
            closeSearchModal();
            resetReissueState();
        });

    if (searchBtn) searchBtn.addEventListener("click", () => void handleSearch());

    if (searchInput)
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                void handleSearch();
            }
        });

    if (cancelEditBtn)
        cancelEditBtn.addEventListener("click", () => {
            closeEditModal();
            resetReissueState();
        });

    if (confirmEditBtn)
        confirmEditBtn.addEventListener("click", () => {
            void handleConfirmEdit();
        });

    if (editNet)
        editNet.addEventListener("input", () => {
            updateTareFromInputs();
        });

    if (editGross)
        editGross.addEventListener("input", () => {
            updateTareFromInputs();
        });
}
