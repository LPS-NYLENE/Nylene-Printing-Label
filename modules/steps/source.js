import { state, showScreen } from "../state.js";
import { getAppInstance } from "../firebase-db.js";
import { initReissueFlow } from "./reissue.js";
import { initReissueNewFlow } from "./reissue-new.js";
import { buildPrintedSnapshotFromRecord } from "../utils/reprint-snapshot.js";
import { findLatestPrintRecordByFlow } from "../utils/print-records.js";
import { runSpecialSourceFlow } from "../utils/special-source-flow.js";
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

    function sourceSpecialButtons() {
        return document.querySelectorAll("#screen-source [data-special]");
    }

    function clearSourceSelection() {
        document
            .querySelectorAll(
                "#screen-source .btn-col[data-group] .option, #screen-source [data-special]",
            )
            .forEach((x) => x.classList.remove("selected"));
        state.source.silo = null;
        state.source.dryer = null;
        state.source.compound = null;
        state.source.special = null;
        state.source.other = null;
        state.activeGroup = null;
        state.selectedProduct = null;
    }

    function getLoginFlow() {
        return localStorage.getItem("last_flow_v1") || "pr";
    }

    function applySourceView() {
        const sourceTitle = document.getElementById("sourceTitle");
        const sourceGrid = document.getElementById("sourceGrid");
        const flow = getLoginFlow();
        const isCompoundA = flow === "compound-a";
        const isCompoundB = flow === "compound-b";
        const isCompoundOnly = isCompoundA || isCompoundB;

        clearReissueState();
        clearSourceSelection();

        if (sourceTitle) {
            if (isCompoundA) {
                sourceTitle.textContent = "CHOOSE SOURCE FOR A-LINE COMPOUND :";
            } else if (isCompoundB) {
                sourceTitle.textContent = "CHOOSE SOURCE FOR B-LINE COMPOUND :";
            } else {
                sourceTitle.textContent = "CHOOSE SOURCE FOR P&R :";
            }
        }

        if (sourceGrid) {
            sourceGrid.classList.toggle("compound-only", isCompoundOnly);
            sourceGrid.classList.toggle("pr-only", !isCompoundOnly);
        }

        document
            .querySelectorAll("#screen-source [data-source-card]")
            .forEach((card) => {
                const kind = card.getAttribute("data-source-card");
                if (isCompoundOnly) {
                    // A/B-Line login: only the COMPOUND card with the matching letter.
                    card.classList.toggle("hidden", kind !== "compound");
                } else {
                    // P&R login: Silo / Dryer only (no Compound column).
                    card.classList.toggle("hidden", kind === "compound");
                }
            });

        document
            .querySelectorAll(
                '#screen-source .btn-col[data-group="compound"] .option',
            )
            .forEach((btn) => {
                const letter = String(btn.dataset.value || "").toUpperCase();
                if (isCompoundA) {
                    btn.classList.toggle("hidden", letter !== "A");
                } else if (isCompoundB) {
                    btn.classList.toggle("hidden", letter !== "B");
                } else {
                    btn.classList.add("hidden");
                }
                btn.classList.remove("selected");
            });

        // Unextracted / Lactam are compound-A specials on the source footer.
        sourceSpecialButtons().forEach((btn) => {
            btn.classList.toggle("hidden", !isCompoundA);
        });
    }

    document.addEventListener("configureSourceView", () => {
        applySourceView();
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
            state.selectedProduct = null;
            showScreen("products");
            document.dispatchEvent(new CustomEvent("renderProductList"));
        });
    });

    sourceSpecialButtons().forEach((btn) => {
        btn.addEventListener("click", () => {
            sourceSpecialButtons().forEach((x) =>
                x.classList.remove("selected"),
            );
            btn.classList.add("selected");
            void runSpecialSourceFlow(state, btn.getAttribute("data-special"), {
                showScreen,
            });
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
