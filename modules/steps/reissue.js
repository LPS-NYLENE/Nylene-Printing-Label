import { state, showScreen } from "../state.js";
import {
    generateUnitNumberFromFirebase,
    generateCoperionUnitNumberFromFirebase,
    generateCompoundBagsUnitNumberFromFirebase,
} from "../utils/generators.js";
import { fetchAllPrintsFromFirebase } from "../firebase-db.js";
import { loadLogs } from "../logs.js";
import { parseNumber } from "../utils/format.js";

const REISSUE_FLAG = "RI";

export function initReissueFlow() {
    const reissueBtn = document.getElementById("btnReissue");
    const searchModal = document.getElementById("reissueSearchModal");
    const searchInput = document.getElementById("reissueBoxSearch");
    const searchBtn = document.getElementById("reissueSearchBtn");
    const cancelSearchBtn = document.getElementById("reissueCancelSearch");
    const searchError = document.getElementById("reissueSearchError");

    const editModal = document.getElementById("reissueEditModal");
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

    function resetReissueState() {
        state.reissueFlag = "";
        state.reissueOriginalUnit = null;
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
        if (editProduct) editProduct.value = record.product || "";
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

    async function findRecordByUnit(unit) {
        const normalized = normalizeUnit(unit);
        if (!normalized) return null;
        try {
            const rows = await fetchAllPrintsFromFirebase();
            const matches = rows.filter(
                (r) => normalizeUnit(r.unitNumber) === normalized
            );
            if (matches.length) return matches[matches.length - 1];
        } catch (e) {
            console.warn("Firebase search failed, falling back to local logs", e);
        }
        const local = loadLogs();
        const localMatches = local.filter(
            (r) => normalizeUnit(r.unitNumber) === normalized
        );
        return localMatches.length ? localMatches[localMatches.length - 1] : null;
    }

    function isCompoundBagsContext(sourceGroup, productCode) {
        const group = String(sourceGroup || "").toLowerCase();
        if (group !== "compound") return false;
        const code = String(productCode || "").trim().toLowerCase();
        return code.endsWith("bags");
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
        const record = await findRecordByUnit(input);
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
        const product = String(editProduct?.value || "").trim();
        const netRaw = String(editNet?.value || "").trim();
        const grossRaw = String(editGross?.value || "").trim();
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

        let newUnit = "";
        try {
            if (isCoperion) {
                newUnit = await generateCoperionUnitNumberFromFirebase();
            } else if (isCompoundBagsContext(sourceGroup, product)) {
                newUnit = await generateCompoundBagsUnitNumberFromFirebase(
                    sourceGroup,
                    sourceLetter
                );
            } else {
                newUnit = await generateUnitNumberFromFirebase(
                    sourceGroup,
                    sourceLetter
                );
            }
        } catch (e) {
            console.warn("Failed to generate reissue unit number", e);
            setEditError("Failed to generate a new box number. Try again.");
            return;
        }

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
