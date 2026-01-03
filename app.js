// App state
const state = {
    source: {
        silo: null,
        dryer: null,
        compound: null,
        special: null,
    },
    activeGroup: null, // 'silo' | 'dryer' | 'compound'
    selectedProduct: null,
    weights: {
        netLb: 0,
        grossLb: 0,
        tareLb: 0,
    },
    unitNumber: generateUnitNumber(),
    bigCode: generateBigCode(),
    excelHandle: null, // FileSystemFileHandle for logs, if chosen
};

// Screen helpers
const screens = {
    source: document.getElementById("screen-source"),
    products: document.getElementById("screen-products"),
    weights: document.getElementById("screen-weights"),
    preview: document.getElementById("screen-preview"),
};

function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
}

// Source selection logic
document.querySelectorAll(".btn-col[data-group] .option").forEach((btn) => {
    btn.addEventListener("click", () => {
        const group = btn.parentElement.getAttribute("data-group");
        // Toggle selection within group
        btn.parentElement
            .querySelectorAll(".option")
            .forEach((x) => x.classList.remove("selected"));
        btn.classList.add("selected");
        state.source[group] = btn.dataset.value;
        state.activeGroup = group;
        // Immediately move to product selection for the chosen source
        state.selectedProduct = null;
        renderProductList();
        const proceedBtnLocal = document.getElementById("btnProceedWeights");
        if (proceedBtnLocal) proceedBtnLocal.disabled = true;
        showScreen("products");
    });
});

document.querySelectorAll("[data-special]").forEach((btn) => {
    btn.addEventListener("click", () => {
        document
            .querySelectorAll("[data-special]")
            .forEach((x) => x.classList.remove("selected"));
        btn.classList.add("selected");
        state.source.special = btn.getAttribute("data-special");
    });
});

document.getElementById("btnNextFromSource").addEventListener("click", () => {
    // Derive active group if not explicitly tracked
    const chosenGroup =
        state.activeGroup ||
        ["silo", "dryer", "compound"].find((g) => state.source[g]);
    if (!chosenGroup || !state.source[chosenGroup]) {
        alert("Please choose a source before continuing.");
        return;
    }
    state.activeGroup = chosenGroup;
    state.selectedProduct = null;
    renderProductList();
    showScreen("products");
});

// Back from products to source
const backToSourceBtn = document.getElementById("backToSource");
if (backToSourceBtn)
    backToSourceBtn.addEventListener("click", () => showScreen("source"));

// From products proceed to weights
const proceedBtn = document.getElementById("btnProceedWeights");
if (proceedBtn)
    proceedBtn.addEventListener("click", () => {
        prefillDefaultWeights();
        showScreen("weights");
        document.getElementById("grossWeight").focus();
    });

// Back from weights to products
document.getElementById("backToProducts").addEventListener("click", () => {
    renderProductList();
    showScreen("products");
});

// Product catalog derived from provided sheet
const PRODUCTS = {
    silo: {
        A: ["BS700D", "BS700A"],
        B: ["BS700D"],
        C: ["BS700R80", "BS700RA", "BS700D", "BS640T"],
        D: ["BS700D"],
    },
    dryer: {
        A: ["700D-INT", "BS640T"],
        B: ["BS700D", "BS640T"],
        C: ["BS700D", "BS640T", "BS640UX"],
        D: ["BS640AFOIL"],
    },
    compound: {
        A: ["BX3WQ662X"],
        B: ["CSDN-INT", "BS700D", "BS640AFOIL", "BS640UX", "PA6-205"],
    },
    extrusion: {
        EA: [],
        EB: [],
    },
    other: {
        UX: ["BS640UX"],
        LT: ["CAPRO"],
    },
};

function renderProductList() {
    const group = state.activeGroup;
    const letter = state.source[group];
    const listEl = document.getElementById("productList");
    const metaEl = document.getElementById("productMeta");
    if (!group || !letter) {
        listEl.innerHTML = "";
        metaEl.textContent = "";
        return;
    }
    const items =
        PRODUCTS[group] && PRODUCTS[group][letter]
            ? PRODUCTS[group][letter]
            : [];
    metaEl.textContent = `${group.toUpperCase()} ${letter}`;
    listEl.innerHTML = "";
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "muted-text";
        empty.textContent = "No products for this source.";
        listEl.appendChild(empty);
    } else {
        items.forEach((prod) => {
            const b = document.createElement("button");
            b.className = "btn product-btn";
            b.textContent = prod;
            b.addEventListener("click", () => {
                // Clear previous selection visual
                listEl
                    .querySelectorAll(".btn")
                    .forEach((x) => x.classList.remove("selected"));
                b.classList.add("selected");
                state.selectedProduct = prod;
                state.bigCode = prod; // bind big code to product
                if (proceedBtn) proceedBtn.disabled = false;
                // Auto-advance to weights with defaults
                prefillDefaultWeights();
                showScreen("weights");
                document.getElementById("grossWeight").focus();
            });
            if (state.selectedProduct === prod) {
                b.classList.add("selected");
            }
            listEl.appendChild(b);
        });
        if (proceedBtn) proceedBtn.disabled = !state.selectedProduct;
    }
}

// Weights screen logic
const inputNet = document.getElementById("netWeight");
const inputGross = document.getElementById("grossWeight");
const inputTare = document.getElementById("tareWeight");
let focusedInput = inputNet;

function prefillDefaultWeights() {
    if (inputNet) inputNet.value = "1800";
    if (inputTare) inputTare.value = "";
    if (inputGross) inputGross.value = "";
    syncWeightsFromInputs();
}

[inputNet, inputGross, inputTare].forEach((inp) => {
    inp.addEventListener("focus", () => {
        focusedInput = inp;
    });
    inp.addEventListener("input", syncWeightsFromInputs);
});

document.getElementById("clearWeights").addEventListener("click", () => {
    inputNet.value = "";
    inputGross.value = "";
    inputTare.value = "";
    syncWeightsFromInputs();
});

// On-screen keypad
document.querySelectorAll(".keys button").forEach((key) => {
    key.addEventListener("click", () => {
        if (!focusedInput) focusedInput = inputNet;
        const label = key.textContent.trim();
        if (label === "⌫") {
            focusedInput.value = focusedInput.value.slice(0, -1);
        } else {
            focusedInput.value += label;
        }
        focusedInput.dispatchEvent(new Event("input", { bubbles: true }));
        focusedInput.focus();
    });
});

function parseNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

function syncWeightsFromInputs() {
    const netRaw = String(inputNet?.value ?? "").trim();
    const grossRaw = String(inputGross?.value ?? "").trim();

    const netLb = parseNumber(netRaw);
    const grossLb = parseNumber(grossRaw);
    state.weights.netLb = netLb;
    state.weights.grossLb = grossLb;

    // Tare weight is derived: tare = gross - net
    if (netRaw && grossRaw) {
        const tareLb = +((grossLb - netLb).toFixed(1));
        state.weights.tareLb = tareLb;
        if (inputTare) inputTare.value = String(tareLb);
    } else {
        state.weights.tareLb = 0;
        if (inputTare) inputTare.value = "";
    }
}

document.getElementById("previewBtn").addEventListener("click", () => {
    syncWeightsFromInputs();
    updatePreview();
    showScreen("preview");
});

document
    .getElementById("backToWeights")
    .addEventListener("click", () => showScreen("weights"));

document.getElementById("clearPreview").addEventListener("click", () => {
    // Reset state minimally
    state.unitNumber = generateUnitNumber();
    state.bigCode = generateBigCode();
    updatePreview();
});

// Preview fill
function lbToKg(lb) {
    return +(lb * 0.45359237).toFixed(1);
}

function updatePreview() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${pad(now.getMonth() + 1)}/${pad(
        now.getDate()
    )}/${now.getFullYear()} ${pad(now.getHours())}:${pad(
        now.getMinutes()
    )}:${pad(now.getSeconds())}`;
    document.getElementById("pkgDate").textContent = stamp;

    document.getElementById("bigCode").textContent = state.unitNumber;

    const grossLb = state.weights.grossLb;
    const netLb = state.weights.netLb;
    const tareLb = state.weights.tareLb;
    document.getElementById("grossKg").textContent = lbToKg(grossLb).toFixed(1);
    document.getElementById("grossLb").textContent = grossLb.toFixed(1);
    document.getElementById("netKg").textContent = lbToKg(netLb).toFixed(1);
    document.getElementById("netLb").textContent = netLb.toFixed(1);
    const tareKgEl = document.getElementById("tareKg");
    const tareLbEl = document.getElementById("tareLb");
    if (tareKgEl && tareLbEl) {
        tareKgEl.textContent = lbToKg(tareLb).toFixed(1);
        tareLbEl.textContent = tareLb.toFixed(1);
    }

    document.getElementById("unitNumber").textContent = state.bigCode;

    // Fill product and source inf
    const productEl = document.getElementById("productName");
    const sourceEl = document.getElementById("sourceChosen");
    const allSelEl = document.getElementById("allSelections");
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
    if (allSelEl) {
        const pieces = [];
        if (state.source.silo) pieces.push(`SILO ${state.source.silo}`);
        if (state.source.dryer) pieces.push(`DRYER ${state.source.dryer}`);
        if (state.source.compound)
            pieces.push(`COMPOUND ${state.source.compound}`);
        if (state.source.special)
            pieces.push(`SPECIAL ${state.source.special}`);
        allSelEl.textContent = pieces.length ? pieces.join("  ·  ") : "—";
    }
}

// Print button
document.getElementById("printBtn").addEventListener("click", async () => {
    // Ensure preview reflects latest state before printing/logging
    updatePreview();
    // Log first, then print
    try {
        await appendLogRecord();
    } catch (err) {
        console.error("Log append failed", err);
        alert("Logging failed. The label will still print.");
    }
    const reloadAfterPrint = () => {
        window.removeEventListener("afterprint", reloadAfterPrint);
        window.location.reload();
    };
    window.addEventListener("afterprint", reloadAfterPrint, { once: true });
    window.print();
    // After printing, prepare next sequential unit number
    state.unitNumber = generateUnitNumber();
    updatePreview();
});

// Build a log record from current state
function buildLogRecord() {
    const now = new Date();
    const toIso = (d) => new Date(d).toISOString();
    const group = state.activeGroup || "";
    const letter = group ? state.source[group] || "" : "";
    return {
        timestamp: toIso(now),
        unitNumber: state.unitNumber,
        product: state.bigCode,
        sourceGroup: group,
        sourceLetter: letter,
        special: state.source.special || "",
        grossLb: Number(state.weights.grossLb || 0),
        grossKg: lbToKg(Number(state.weights.grossLb || 0)),
        netLb: Number(state.weights.netLb || 0),
        netKg: lbToKg(Number(state.weights.netLb || 0)),
        tareLb: Number(state.weights.tareLb || 0),
        tareKg: lbToKg(Number(state.weights.tareLb || 0)),
    };
}

// Local storage helpers for logs
const LOGS_KEY = "print_logs_v1";
function loadLogs() {
    try {
        const raw = localStorage.getItem(LOGS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}
function saveLogs(logs) {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

async function appendLogRecord() {
    const logs = loadLogs();
    const record = buildLogRecord();
    logs.push(record);
    saveLogs(logs);
    // Try writing to chosen Excel file if available
    if (state.excelHandle && (await verifyHandleWriteable(state.excelHandle))) {
        await appendToExcelFile(state.excelHandle, logs);
    }
}

async function verifyHandleWriteable(handle) {
    try {
        // Request permission if needed
        if (
            (await handle.queryPermission({ mode: "readwrite" })) !== "granted"
        ) {
            const res = await handle.requestPermission({ mode: "readwrite" });
            if (res !== "granted") return false;
        }
        return true;
    } catch {
        return false;
    }
}

// Append or create workbook on a file handle
async function appendToExcelFile(fileHandle, logs) {
    try {
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: "array" });
        const wsName = wb.SheetNames[0] || "Logs";
        const ws = wb.Sheets[wsName];
        const existing = XLSX.utils.sheet_to_json(ws);
        const merged = mergeByTimestamp(existing, logs);
        const newWs = XLSX.utils.json_to_sheet(merged);
        wb.Sheets[wsName] = newWs;
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
    } catch (e) {
        // If file not found or not an excel, create new workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(logs);
        XLSX.utils.book_append_sheet(wb, ws, "Logs");
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const writable = await fileHandle.createWritable();
        await writable.write(out);
        await writable.close();
    }
}

function mergeByTimestamp(existingRows, newRows) {
    const seen = new Set(
        existingRows.map((r) => r.timestamp + ":" + r.unitNumber)
    );
    const merged = existingRows.slice();
    for (const r of newRows) {
        const key = r.timestamp + ":" + r.unitNumber;
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(r);
        }
    }
    return merged;
}

// Download logs as Excel
document.getElementById("exportLogsBtn").addEventListener("click", () => {
    const logs = loadLogs();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(logs);
    XLSX.utils.book_append_sheet(wb, ws, "Logs");
    XLSX.writeFile(
        wb,
        `label-logs-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
});

// EXCEL pill: choose file handle or download
document.getElementById("excelBtn").addEventListener("click", async () => {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `label-logs-${new Date()
                    .toISOString()
                    .slice(0, 10)}.xlsx`,
                types: [
                    {
                        description: "Excel Files",
                        accept: {
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                                [".xlsx"],
                        },
                    },
                ],
            });
            state.excelHandle = handle;
            // Write current logs immediately so the file exis
            const logs = loadLogs();
            await appendToExcelFile(handle, logs);
            alert("Excel log file is set. Future prints will append.");
        } catch (e) {
            console.warn("Excel file selection cancelled or failed", e);
        }
    } else {
        // Fallback: download current logs now
        const logs = loadLogs();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(logs);
        XLSX.utils.book_append_sheet(wb, ws, "Logs");
        XLSX.writeFile(
            wb,
            `label-logs-${new Date().toISOString().slice(0, 10)}.xlsx`
        );
    }
});

// Generators
// Unit Number format: AC15 + DDD + SSS
// - Prefix: "AC15"
// - DDD: day-of-year (001-365/366) for current year
// - SSS: sequential 3-digit counter starting at 001 each day
function generateUnitNumber() {
    const now = new Date();
    const doy = getDayOfYear(now); // 1..365/366
    const doyStr = String(doy).padStart(3, "0");
    const seq = getAndIncrementDailySequence(now);
    const seqStr = String(seq).padStart(3, "0");
    return `AC15${doyStr}${seqStr}`;
}

function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const diffMs = date - start;
    const oneDayMs = 24 * 60 * 60 * 1000;
    return Math.floor(diffMs / oneDayMs) + 1;
}

const SEQ_STORE_KEY = "unit_seq_store_v1";
function getAndIncrementDailySequence(date) {
    try {
        const y = date.getFullYear();
        const doy = getDayOfYear(date);
        const key = `${y}-${doy}`;
        const raw = localStorage.getItem(SEQ_STORE_KEY);
        const store = raw ? JSON.parse(raw) : {};
        const current = store[key] || 0;
        const next = current + 1;
        store[key] = next;
        // Keep only recent entries to avoid unbounded growth (e.g., last 370 days)
        const entries = Object.entries(store)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .slice(-370);
        const trimmed = Object.fromEntries(entries);
        localStorage.setItem(SEQ_STORE_KEY, JSON.stringify(trimmed));
        return next;
    } catch {
        // Fallback if localStorage is unavailable
        if (!window.__fallbackSeq) window.__fallbackSeq = 0;
        window.__fallbackSeq += 1;
        return window.__fallbackSeq;
    }
}

function generateBigCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 7; i++)
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}

// Initialize
updatePreview();
