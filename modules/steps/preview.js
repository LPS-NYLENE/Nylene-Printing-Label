import { state, showScreen } from "../state.js";
import {
    generateUnitNumberFromFirebase,
    generateCoperionUnitNumberFromFirebase,
    generateCompoundBagsUnitNumberFromFirebase,
} from "../utils/generators.js";
import { lbToKg } from "../utils/format.js";

import { appendLogRecord, bindExcelButton, buildLogRecord } from "../logs.js";
import { appendHistoryRecord } from "../history.js";
import {
    enqueuePrintJob,
    waitForPrintJobStart,
    completePrintJob,
    startPrintJobLeaseRenewal,
    createPrintRequestId,
} from "../print-queue.js";

export function initPreviewStep() {
    document.addEventListener("updatePreview", () => {
        // Fire-and-forget: we refresh the unit number first, then render.
        // (Event listeners cannot be awaited by callers.)
        void handleUpdatePreview();
    });
    void handleUpdatePreview();

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

    async function beginQueuedPrint({ allowDuplicate, onStatusChange }) {
        const record = buildLogRecord();
        const labelKey = String(record.unitNumber || "").trim();
        if (!labelKey) throw new Error("Missing label number.");
        const requestId = allowDuplicate ? createPrintRequestId() : null;
        const job = await enqueuePrintJob({
            labelKey,
            record,
            allowDuplicate,
            requestId,
        });
        await waitForPrintJobStart({
            labelKey,
            jobId: job.jobId,
            initialStatus: job.status,
            onStatusChange,
        });
        return { labelKey, jobId: job.jobId };
    }

    function handleQueueError(err) {
        if (!err || !err.code) return false;
        if (err.code === "job_completed") {
            alert("This label was already printed.");
            return true;
        }
        if (err.code === "job_timeout") {
            alert("Print queue timed out. Please try again.");
            return true;
        }
        if (err.code === "job_failed") {
            alert("Print queue could not start. Please try again.");
            return true;
        }
        if (err.code === "job_missing") {
            alert("Print job no longer exists. Please try again.");
            return true;
        }
        return false;
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
        // Ensure the displayed number is based on the current product/context.
        await refreshUnitNumberIfNeeded();
        renderPreview();
        let queueJob = null;
        let stopLease = null;
        let printError = null;
        let logError = null;

        try {
            queueJob = await beginQueuedPrint({
                allowDuplicate: false,
                onStatusChange: (data) => {
                    if (!printBtn) return;
                    if (data.status === "queued") {
                        printBtn.textContent = "Queued...";
                    }
                    if (data.status === "running") {
                        printBtn.textContent = "Printing...";
                    }
                },
            });
        } catch (err) {
            if (handleQueueError(err)) {
                renderPreview();
                return;
            }
            throw err;
        }

        try {
            stopLease = startPrintJobLeaseRenewal(queueJob);
            await openPrintDialog(getDesiredPrintCopies());
        } catch (err) {
            printError = err;
        }

        if (!printError) {
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
                logError = err;
            }
        }

        if (stopLease) stopLease();
        if (queueJob) {
            const outcome = printError ? "failed" : "completed";
            const errorDetail = printError
                ? String(printError)
                : logError
                ? String(logError)
                : "";
            try {
                await completePrintJob({
                    labelKey: queueJob.labelKey,
                    jobId: queueJob.jobId,
                    outcome,
                    error: errorDetail,
                });
            } catch (err) {
                console.warn("Failed to complete print job", err);
            }
        }

        if (printError) {
            throw printError;
        }
        if (logError) {
            console.error("Log append failed after print", logError);
            alert("Saving log failed after printing.");
        }

        renderPreview();
        // Reload the app after printing completes
        window.location.reload();
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

        let queueJob = null;
        let stopLease = null;
        let printError = null;
        try {
            queueJob = await beginQueuedPrint({
                allowDuplicate: true,
                onStatusChange: (data) => {
                    if (!printBtn) return;
                    if (data.status === "queued") {
                        printBtn.textContent = "Queued...";
                    }
                    if (data.status === "running") {
                        printBtn.textContent = "Printing...";
                    }
                },
            });
        } catch (err) {
            if (!handleQueueError(err)) {
                throw err;
            }
            state.unitNumber = previous.unitNumber;
            state.bigCode = previous.bigCode;
            state.weights = { ...previous.weights };
            state.source = { ...previous.source };
            state.activeGroup = previous.activeGroup;
            state.previewTimestamp = previous.previewTimestamp;
            renderPreview();
            return;
        }

        try {
            stopLease = startPrintJobLeaseRenewal(queueJob);
            await openPrintDialog(getDesiredPrintCopies());
        } catch (err) {
            printError = err;
        } finally {
            if (stopLease) stopLease();
            if (queueJob) {
                const outcome = printError ? "failed" : "completed";
                const errorDetail = printError ? String(printError) : "";
                try {
                    await completePrintJob({
                        labelKey: queueJob.labelKey,
                        jobId: queueJob.jobId,
                        outcome,
                        error: errorDetail,
                    });
                } catch (err) {
                    console.warn("Failed to complete print job", err);
                }
            }
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

    function renderPreview() {
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
