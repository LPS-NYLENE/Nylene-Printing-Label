import { state, showScreen } from "../state.js";
import { generateUnitNumberFromFirebase } from "../utils/generators.js";
import { getAppInstance } from "../firebase-db.js";
import { initReissueFlow } from "./reissue.js";
import { initReissueNewFlow } from "./reissue-new.js";
import { buildPrintedSnapshotFromRecord } from "../utils/reprint-snapshot.js";
import { findLatestPrintRecordByFlow } from "../utils/print-records.js";
import {
    getAuth,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function initSourceStep() {
    function clearReissueState() {
        state.reissueFlag = "";
        state.reissueOriginalUnit = null;
        state.reissueFlowType = null;
        state.lockUnitNumberOnce = false;
    }

    function clearSourceSelection() {
        document
            .querySelectorAll(".btn-col[data-group] .option, [data-special]")
            .forEach((x) => x.classList.remove("selected"));
        state.source.silo = null;
        state.source.dryer = null;
        state.source.compound = null;
        state.source.special = null;
        state.source.other = null;
        state.activeGroup = null;
        state.selectedProduct = null;
    }

    function normalizeCompoundLine(line) {
        const value = String(line || "").toUpperCase();
        return value === "A" || value === "B" ? value : null;
    }

    function applySourceView(detail = {}) {
        const compoundLine = normalizeCompoundLine(detail.compoundLine);
        const isCompoundOnly = Boolean(compoundLine);
        const sourceTitle = document.getElementById("sourceTitle");
        const sourceGrid = document.getElementById("sourceGrid");

        clearReissueState();
        clearSourceSelection();

        if (sourceTitle) {
            sourceTitle.textContent = isCompoundOnly
                ? "CHOOSE SOURCE FOR COMPOUND :"
                : "CHOOSE SOURCE FOR P&R :";
        }
        if (sourceGrid) {
            sourceGrid.classList.toggle("compound-only", isCompoundOnly);
        }
        document.querySelectorAll("[data-source-card]").forEach((card) => {
            const group = card.getAttribute("data-source-card");
            card.classList.toggle(
                "hidden",
                // isCompoundOnly && group !== "compound"
                isCompoundOnly ? group !== "compound" : group === "compound"
            );
        });
        document
            .querySelectorAll('.btn-col[data-group="compound"] .option')
            .forEach((btn) => {
                btn.classList.toggle(
                    "hidden",
                    isCompoundOnly && btn.dataset.value !== compoundLine
                );
            });
        document.querySelectorAll("[data-special]").forEach((btn) => {
            btn.classList.toggle("hidden", isCompoundOnly);
        });
    }

    document.addEventListener("configureSourceView", (event) => {
        applySourceView(event.detail || {});
    });
    applySourceView();

    const copBtn = document.getElementById("btnCoperion");
    if (copBtn)
        copBtn.addEventListener("click", () => {
            clearReissueState();
            // Default Coperion context
            state.activeGroup = "compound";
            state.source.compound = "A";
            state.isCoperion = true;
            showScreen("coperion");
            document.dispatchEvent(new CustomEvent("enterCoperion"));
        });
    document.querySelectorAll(".btn-col[data-group] .option").forEach((btn) => {
        btn.addEventListener("click", () => {
            clearReissueState();
            const group = btn.parentElement.getAttribute("data-group");
            btn.parentElement
                .querySelectorAll(".option")
                .forEach((x) => x.classList.remove("selected"));
            btn.classList.add("selected");
            state.source[group] = btn.dataset.value;
            state.activeGroup = group;
            state.isCoperion = false;
            // Regenerate the unit number to reflect the new prefix mapping (from Firebase)
            (async () => {
                try {
                    const next = await generateUnitNumberFromFirebase(
                        group,
                        state.source[group]
                    );
                    state.unitNumber = next;
                    document.dispatchEvent(new CustomEvent("updatePreview"));
                } catch (e) {
                    console.warn(
                        "Failed to fetch next unit number from Firebase",
                        e
                    );
                }
            })();
            state.selectedProduct = null;
            showScreen("products");
            document.dispatchEvent(new CustomEvent("renderProductList"));
        });
    });

    document.querySelectorAll("[data-special]").forEach((btn) => {
        btn.addEventListener("click", () => {
            clearReissueState();
            document
                .querySelectorAll("[data-special]")
                .forEach((x) => x.classList.remove("selected"));
            btn.classList.add("selected");
            // state.source.special = btn.getAttribute("data-speciall");
            const special = btn.getAttribute("data-special");
            state.source.special = special;
            // Map special to synthetic group/letter for prefix logic
            state.activeGroup = "other";
            if (special === "Unextracted") {
                state.source.other = "UX";
            } else if (special === "Lactam") {
                state.source.other = "LT";
            }
            // Override displayed product name for special selections
            if (special === "Unextracted") {
                state.bigCode = "BS640UX";
            } else if (special === "Lactam") {
                state.bigCode = "Capro";
            }
            // Update displayed unit number with new prefix and skip product selection
            (async () => {
                try {
                    const next = await generateUnitNumberFromFirebase(
                        state.activeGroup,
                        state.source.other
                    );
                    state.unitNumber = next;
                } catch (e) {
                    console.warn(
                        "Failed to fetch next unit number from Firebase (special)",
                        e
                    );
                }
            })();
            state.selectedProduct = null;
            // Prefill default weights and go directly to weights screen (Enter Tare)
            document.dispatchEvent(new CustomEvent("prefillDefaultWeights"));
            showScreen("weights");
            const gross = document.getElementById("grossWeight");
            if (gross) gross.focus();
        });
    });

    const next = document.getElementById("btnNextFromSource");
    if (next)
        next.addEventListener("click", () => {
            clearReissueState();
            const chosenGroup =
                state.activeGroup ||
                ["silo", "dryer", "compound"].find((g) => state.source[g]);
            if (!chosenGroup || !state.source[chosenGroup]) {
                alert("Please choose a source before continuing.");
                return;
            }
            state.activeGroup = chosenGroup;
            state.selectedProduct = null;
            showScreen("products");
            document.dispatchEvent(new CustomEvent("renderProductList"));
        });

    // Log out current user
    const logoutBtn = document.getElementById("btnLogout");
    if (logoutBtn)
        logoutBtn.addEventListener("click", async () => {
            try {
                const app = getAppInstance();
                const auth = getAuth(app);
                await signOut(auth);
            } catch (e) {
                console.warn("Failed to sign out", e);
                alert("Failed to log out. Please try again.");
            }
        });

    // Reprint the latest matching label from Firebase so every system uses the same source.
    const reprintButtons = [
        {
            button: document.getElementById("btnReprint"),
            isCoperion: false,
        },
        {
            button: document.getElementById("btnReprintCoperion"),
            isCoperion: true,
        },
    ].filter(({ button }) => Boolean(button));
    reprintButtons.forEach(({ button, isCoperion }) => {
        button.addEventListener("click", async () => {
            let snap = null;
            const originalLabel = button.textContent;
            button.disabled = true;
            button.textContent = "Loading...";
            try {
                const latestRecord = await findLatestPrintRecordByFlow(isCoperion);
                snap = buildPrintedSnapshotFromRecord(latestRecord);
            } catch (e) {
                console.warn("Failed to fetch latest reprint record from Firebase", e);
                alert("Unable to load the latest label from the database.");
                return;
            } finally {
                button.disabled = false;
                button.textContent = originalLabel;
            }
            if (!snap) {
                alert("No previous label to reprint.");
                return;
            }

            state.lastPrinted = snap;
            state.reprintAvailable = true;

            // Save current working state to restore after printing
            const saved = {
                unitNumber: state.unitNumber,
                bigCode: state.bigCode,
                weights: { ...state.weights },
                source: { ...state.source },
                activeGroup: state.activeGroup,
                isCoperion: state.isCoperion,
                previewTimestamp: state.previewTimestamp,
            };

            // Apply snapshot state for reprint
            state.unitNumber = snap.unitNumber;
            state.bigCode = snap.bigCode;
            state.weights = { ...snap.weights };
            state.source = { ...snap.source };
            state.activeGroup = snap.activeGroup || null;
            state.isCoperion = Boolean(snap.isCoperion);
            state.previewTimestamp = snap.printedAt || snap.timestamp || null;

            // Render the exact snapshot instead of refreshing the next lot number.
            document.dispatchEvent(new CustomEvent("renderPreviewOnly"));
            const restore = () => {
                state.unitNumber = saved.unitNumber;
                state.bigCode = saved.bigCode;
                state.weights = saved.weights;
                state.source = saved.source;
                state.activeGroup = saved.activeGroup;
                state.isCoperion = saved.isCoperion;
                state.previewTimestamp = saved.previewTimestamp || null;
                window.removeEventListener("afterprint", restore);
                // Reload the app after printing completes
                window.location.reload();
            };
            window.addEventListener("afterprint", restore, { once: true });
            window.print();
        });
    });

    initReissueFlow();
    initReissueNewFlow();
}
