import { state, showScreen } from "../state.js";
import {
    generateUnitNumberFromFirebase,
    generateCoperionUnitNumberFromFirebase,
    generateCompoundBagsUnitNumberFromFirebase,
} from "../utils/generators.js";
import { lbToKg } from "../utils/format.js";
import {
    confirmYesNo,
    promptForLotNumber,
    promptForPassword,
} from "../utils/operator-prompts.js";
import {
    normalizeUnitNumber,
    parseSourceFromPrefix,
} from "../utils/unit-number.js";

import { appendLogRecord, bindExcelButton } from "../logs.js";
import { appendHistoryRecord } from "../history.js";

export function initPreviewStep() {
    document.addEventListener("updatePreview", () => {
        // Fire-and-forget: we refresh the unit number first, then render.
        // (Event listeners cannot be awaited by callers.)
        void handleUpdatePreview();
    });
    void handleUpdatePreview();

    function updateModifyButtonVisibility() {
        const back = document.getElementById("backToWeights");
        if (!back) return;
        // For existing-label reissues, preview should not offer "Modify".
        const isExistingReissue = state.reissueFlowType === "existing";
        back.style.display = isExistingReissue ? "none" : "";
    }

    const back = document.getElementById("backToWeights");
    if (back)
        back.addEventListener("click", () => {
            if (state.reissueFlowType === "new") {
                void handleReissueModify();
                return;
            }
            showScreen("weights");
        });

    const clear = document.getElementById("clearPreview");
    if (clear)
        clear.addEventListener("click", () => {
            if (state.reissueFlowType) {
                resetReissueAndReturnHome();
                return;
            }
            // Keep same values; just re-render/refresh preview.
            document.dispatchEvent(new CustomEvent("updatePreview"));
        });

    // Determine how many copies should be printed for the current product
    function getDesiredPrintCopies() {
        const code = String(state.bigCode || "");
        return code.toLowerCase().includes("bags") ? 4 : 2;
    }

    // Prepare DOM to print N copies by cloning the label canvas. Extra copies
    // stay hidden on screen and are removed automatically after printing.
    function preparePrintCopies(copyCount) {
        const count = Math.max(1, copyCount);
        if (count <= 1) return () => {};
        const original = document.getElementById("labelCanvas");
        if (!original || !original.parentElement) return () => {};

        // If clones already exist (e.g., user re-clicked quickly), skip work
        const existing = original.parentElement.querySelectorAll(
            '.label-canvas[data-print-duplicate="true"]'
        );
        if (existing.length) return () => {};

        const clones = [];
        let insertAfter = original;
        for (let i = 1; i < count; i += 1) {
            const duplicate = original.cloneNode(true);
            duplicate.setAttribute("data-print-duplicate", "true");
            duplicate.style.display = "none";
            insertAfter.insertAdjacentElement("afterend", duplicate);
            insertAfter = duplicate;
            clones.push(duplicate);
        }

        return () => {
            clones.forEach((clone) => {
                if (clone && clone.parentNode)
                    clone.parentNode.removeChild(clone);
            });
        };
    }

    function createAfterPrintAwaiter() {
        let resolver;
        let settled = false;
        const wait = new Promise((resolve) => {
            resolver = resolve;
        });
        const handler = () => {
            if (settled) return;
            settled = true;
            window.removeEventListener("afterprint", handler);
            resolver();
        };
        window.addEventListener("afterprint", handler, { once: true });
        return {
            wait,
            cancel: () => handler(),
        };
    }

    async function openPrintDialog(copyCount) {
        const cleanupCopies = preparePrintCopies(copyCount);
        const { wait, cancel } = createAfterPrintAwaiter();
        try {
            window.print();
        } catch (err) {
            cancel();
            cleanupCopies();
            throw err;
        }
        await wait;
        cleanupCopies();
    }

    const printBtn = document.getElementById("printBtn");
    let printInFlight = false;
    if (printBtn)
        printBtn.addEventListener("click", async () => {
            if (printInFlight) return;
            printInFlight = true;
            try {
                if (state.reprintAvailable && state.lastPrinted) {
                    await handleReprintFlow();
                    return;
                }
                await handleInitialPrintFlow();
            } catch (err) {
                console.error("Failed to start printing", err);
                alert(
                    "Printing could not be started. Please check your browser settings and try again."
                );
            } finally {
                printInFlight = false;
            }
        });

    function resetReissueAndReturnHome() {
        state.reissueFlag = "";
        state.reissueOriginalUnit = null;
        state.reissueFlowType = null;
        state.lockUnitNumberOnce = false;
        state.reprintAvailable = false;
        state.lastPrinted = null;
        state.previewTimestamp = null;
        showScreen("source");
    }

    async function handleReissueModify() {
        const authed = await promptForPassword({
            title: "Enter password",
            expected: "NYLENE",
        });
        if (!authed) return;

        const entered = await promptForLotNumber({
            title: "Enter Lot number",
            initialValue: state.unitNumber || "",
        });
        if (!entered) return;

        const unit = normalizeUnitNumber(entered);
        const ok = await confirmYesNo({
            title: "Confirm lot number",
            message: `Do you wish to continue with ${unit}?`,
            yesText: "Yes",
            noText: "No",
        });
        if (!ok) return;

        const prefix = unit.slice(0, 2);
        const parsed = parseSourceFromPrefix(prefix);
        if (!parsed) {
            alert("Invalid lot number source prefix.");
            return;
        }

        const previous = normalizeUnitNumber(state.unitNumber);
        state.isCoperion = false;
        state.activeGroup = parsed.group;
        state.source[parsed.group] = parsed.letter;
        state.source.special = null;
        state.unitNumber = unit;
        state.lockUnitNumberOnce = true;
        state.reissueFlag = "RI";
        state.reissueOriginalUnit = previous || unit;
        state.reissueFlowType = "new";

        document.dispatchEvent(new CustomEvent("updatePreview"));
        showScreen("preview");
    }

    async function handleInitialPrintFlow() {
        // Ensure the displayed number is based on the current product/context.
        await refreshUnitNumberIfNeeded();
        renderPreview();
        await openPrintDialog(getDesiredPrintCopies());
        try {
            await appendLogRecord();
            appendHistoryRecord();
            // Use the displayed unit number as the committed one
            const committed = state.unitNumber;
            const group = state.activeGroup;
            const letter = group ? state.source[group] : undefined;
            // Save snapshot of what was printed for reprint
            const printedAt = new Date().toISOString();
            state.lastPrinted = {
                printedAt,
                unitNumber: committed,
                bigCode: state.bigCode,
                weights: { ...state.weights },
                source: { ...state.source },
                activeGroup: state.activeGroup,
            };
            state.reprintAvailable = true;
            // Prepare next displayed number by reading from Firebase
            try {
                const next = await getNextUnitNumberForPreview(group, letter);
                state.unitNumber = next;
            } catch (e) {
                console.warn(
                    "Failed to refresh next unit number from Firebase",
                    e
                );
            }
        } catch (err) {
            console.error("Log append failed after print", err);
            alert("Saving log failed after printing.");
        } finally {
            renderPreview();
            // Reload the app after printing completes
            window.location.reload();
        }
    }

    async function handleReprintFlow() {
        const previous = {
            unitNumber: state.unitNumber,
            bigCode: state.bigCode,
            weights: { ...state.weights },
            source: { ...state.source },
            activeGroup: state.activeGroup,
            previewTimestamp: state.previewTimestamp,
        };

        const snapshot = state.lastPrinted;
        // Override state with last printed snapshot for preview/print only
        state.unitNumber = snapshot.unitNumber;
        state.bigCode = snapshot.bigCode;
        state.weights = { ...snapshot.weights };
        state.source = { ...snapshot.source };
        state.activeGroup = snapshot.activeGroup;
        state.previewTimestamp = snapshot.printedAt;
        renderPreview();

        let printError = null;
        try {
            await openPrintDialog(getDesiredPrintCopies());
        } catch (err) {
            printError = err;
        } finally {
            state.unitNumber = previous.unitNumber;
            state.bigCode = previous.bigCode;
            state.weights = { ...previous.weights };
            state.source = { ...previous.source };
            state.activeGroup = previous.activeGroup;
            state.previewTimestamp = previous.previewTimestamp;
            renderPreview();
        }
        if (printError) throw printError;
        state.reprintAvailable = false;
        window.location.reload();
    }

    const openDbBtn = document.getElementById("openLabelDb");
    if (openDbBtn)
        openDbBtn.addEventListener("click", () => {
            showScreen("labeldb");
        });

    bindExcelButton();

    // After wiring up UI, attempt an initial refresh only if we have enough context.
    // Otherwise, we’ll refresh on first entry into Preview (updatePreview event).
    (async function refreshUnit() {
        try {
            const group = state.activeGroup;
            const letter = group ? state.source[group] : undefined;
            if (!state.isCoperion && (!group || !letter)) return;
            if (!state.isCoperion && !String(state.bigCode || "").trim()) return;
            await refreshUnitNumberIfNeeded(true);
            renderPreview();
        } catch (e) {
            console.warn("Initial Firebase unit number fetch failed", e);
        }
    })();

    function isCompoundBagsContext(activeGroup, productCode) {
        const group = String(activeGroup || "").toLowerCase();
        if (group !== "compound") return false;
        const code = String(productCode || "").trim().toLowerCase();
        return code.endsWith("bags");
    }

    async function getNextUnitNumberForPreview(group, letter) {
        if (state.isCoperion) return await generateCoperionUnitNumberFromFirebase();
        if (isCompoundBagsContext(group, state.bigCode))
            return await generateCompoundBagsUnitNumberFromFirebase(group, letter);
        return await generateUnitNumberFromFirebase(group, letter);
    }

    function getUnitNumberContextKey() {
        const group = String(state.activeGroup || "").toLowerCase();
        const letter = group ? String(state.source[group] || "") : "";
        const product = String(state.bigCode || "").trim();
        // Include flow + bag-ness so we refresh when toggling between products.
        const isBags = isCompoundBagsContext(group, product);
        const flow = state.isCoperion ? "cop" : "pr";
        return `${flow}:${group}:${letter}:${isBags ? "bags" : "std"}:${product}`;
    }

    async function refreshUnitNumberIfNeeded(force = false) {
        const key = getUnitNumberContextKey();
        if (state.lockUnitNumberOnce) {
            state.lockUnitNumberOnce = false;
            state.__unitNumberContextKey = key;
            return;
        }
        if (!force && state.__unitNumberContextKey === key && state.unitNumber) return;
        const group = state.activeGroup;
        const letter = group ? state.source[group] : undefined;
        // If we still don't have enough context, do nothing (prevents early stale fetches).
        if (!state.isCoperion && (!group || !letter)) return;
        if (!state.isCoperion && !String(state.bigCode || "").trim()) return;
        const next = await getNextUnitNumberForPreview(group, letter);
        state.unitNumber = next;
        state.__unitNumberContextKey = key;
    }

    async function handleUpdatePreview() {
        try {
            await refreshUnitNumberIfNeeded();
        } catch (e) {
            console.warn("Failed to refresh unit number for preview", e);
        }
        renderPreview();
    }

    function renderProductName(productEl, productCode) {
        if (!productEl) return;
        const raw = typeof productCode === "string" ? productCode.trim() : "";
        productEl.textContent = "";
        if (!raw) {
            productEl.textContent = "—";
            return;
        }
        const match = raw.match(/^(.*?)(-(01|02))$/);
        if (match) {
            const base = match[1];
            const suffix = match[2];
            productEl.appendChild(document.createTextNode(base));
            productEl.appendChild(document.createElement("br"));
            productEl.appendChild(document.createTextNode(suffix));
            return;
        }
        productEl.textContent = raw;
    }

    function renderPreview() {
        updateModifyButtonVisibility();
        const now = state.previewTimestamp
            ? new Date(state.previewTimestamp)
            : new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const stamp = `${pad(now.getMonth() + 1)}/${pad(
            now.getDate()
        )}/${now.getFullYear()} ${pad(now.getHours())}:${pad(
            now.getMinutes()
        )}:${pad(now.getSeconds())}`;
        const pkgDate = document.getElementById("pkgDate");
        if (pkgDate) pkgDate.textContent = stamp;

        const bigCode = document.getElementById("bigCode");
        if (bigCode) bigCode.textContent = state.unitNumber;

        const grossLb = state.weights.grossLb;
        const netLb = state.weights.netLb;
        const tareLb = state.weights.tareLb;
        const grossKgEl = document.getElementById("grossKg");
        const grossLbEl = document.getElementById("grossLb");
        const netKgEl = document.getElementById("netKg");
        const netLbEl = document.getElementById("netLb");
        const tareKgEl = document.getElementById("tareKg");
        const tareLbEl = document.getElementById("tareLb");
        if (grossKgEl) grossKgEl.textContent = lbToKg(grossLb).toFixed(1);
        if (grossLbEl) grossLbEl.textContent = grossLb.toFixed(1);
        if (netKgEl) netKgEl.textContent = lbToKg(netLb).toFixed(1);
        if (netLbEl) netLbEl.textContent = netLb.toFixed(1);
        if (tareKgEl) tareKgEl.textContent = lbToKg(tareLb).toFixed(1);
        if (tareLbEl) tareLbEl.textContent = tareLb.toFixed(1);

        const unit = document.getElementById("unitNumber");
        if (unit) unit.textContent = state.bigCode;

        const productEl = document.getElementById("productName");
        const sourceEl = document.getElementById("sourceChosen");
        renderProductName(productEl, state.bigCode);
        if (sourceEl) {
            const group = state.activeGroup;
            const letter = group ? state.source[group] : null;
            const special = state.source.special
                ? ` (${state.source.special})`
                : "";
            sourceEl.textContent =
                group && letter
                    ? `${group.toUpperCase()} ${letter}${special}`
                    : "—";
        }

        // Render barcode encoding Box number, Product, and Net weight (LBS)
        // try {
        //     const barcodeEl = document.getElementById("labelBarcode");
        //     if (barcodeEl && window.JsBarcode) {
        //         const barcodeData = `BOX:${state.unitNumber}|PROD:${
        //             state.bigCode || ""
        //         }|NETLB:${Number(state.weights.netLb || 0).toFixed(1)}`;
        //         window.JsBarcode(barcodeEl, barcodeData, {
        //             format: "CODE128",
        //             lineColor: "#000",
        //             width: 2,
        //             height: 60,
        //             displayValue: false,
        //             margin: 0,
        //         });
        //     }
        // } catch (e) {d
        //     // Fail silently if barcode cannot render
        // }
        const barcodeData = `
        BOX:${state.unitNumber}|
        PROD:${state.bigCode || ""}|
        NETLB:${Number(state.weights.netLb || 0).toFixed(1)}`;

        console.log(barcodeData, "barcodeData");

        JsBarcode("#labelBarcode", `${state.unitNumber}`, {
            displayValue: false,
            width: 3,
            height: 30,
        });

        // Update the print button label according to mod
        const printBtn = document.getElementById("printBtn");
        if (printBtn)
            printBtn.textContent =
                state.reprintAvailable && state.lastPrinted
                    ? "Reprint"
                    : state.reissueFlowType
                      ? "Reissue"
                      : "Print";
    }
}
