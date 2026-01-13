import { state, showScreen } from "../state.js";
import {
    generateUnitNumberFromFirebase,
    generateCoperionUnitNumberFromFirebase,
} from "../utils/generators.js";
import { lbToKg } from "../utils/format.js";

import { appendLogRecord, bindExcelButton } from "../logs.js";
import { appendHistoryRecord } from "../history.js";

export function initPreviewStep() {
    document.addEventListener("updatePreview", updatePreview);
    updatePreview();

    const back = document.getElementById("backToWeights");
    if (back) back.addEventListener("click", () => showScreen("weights"));

    const clear = document.getElementById("clearPreview");
    if (clear)
        clear.addEventListener("click", () => {
            state.unitNumber = state.unitNumber; // keep same by default/
            updatePreview();
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

    async function handleInitialPrintFlow() {
        updatePreview();
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
                const next = state.isCoperion
                    ? await generateCoperionUnitNumberFromFirebase()
                    : await generateUnitNumberFromFirebase(group, letter);
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
            updatePreview();
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
        updatePreview();

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
            updatePreview();
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

    // After wiring up UI, refresh the unit number from Firebase for preview
    (async function refreshUnit() {
        try {
            const group = state.activeGroup;
            const letter = group ? state.source[group] : undefined;
            const next = state.isCoperion
                ? await generateCoperionUnitNumberFromFirebase()
                : await generateUnitNumberFromFirebase(group, letter);
            state.unitNumber = next;
            updatePreview();
        } catch (e) {
            console.warn("Initial Firebase unit number fetch failed", e);
        }
    })();

    function updatePreview() {
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
        if (productEl) productEl.textContent = state.bigCode || "—";
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
                    : "Print";
    }
}
