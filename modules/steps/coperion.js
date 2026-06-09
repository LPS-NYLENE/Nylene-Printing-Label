import { state, showScreen } from "../state.js";
import {
    fetchProductSelectionFromFirebase,
    getAppInstance,
    saveProductSelectionToFirebase,
    subscribeToProductSelection,
} from "../firebase-db.js";
import {
    getAuth,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { generateCoperionUnitNumberFromFirebase } from "../utils/generators.js";
import {
    COPERION_DEFAULT_PRODUCT,
    COPERION_PRODUCT_CHOICES,
} from "../catalog/product-choices.js";
import {
    buildProductSelectionContext,
    buildSharedProductSelectionPayload,
    clearLegacyProductSelection,
    normalizeSharedProductSelection,
    readLegacyProductSelection,
} from "../utils/product-selection.js";

function normalizeCoperionProduct(product) {
    const normalized = String(product || "").trim();
    return COPERION_PRODUCT_CHOICES.includes(normalized) ? normalized : null;
}

let unsubscribeProductSelection = () => {};
let subscribedContextKey = null;

export function initCoperionStep() {
    const back = document.getElementById("backToSourceFromCoperion");
    if (back)
        back.addEventListener("click", () => {
            state.isCoperion = false;
            showScreen("source");
        });

    const ctn = document.getElementById("coperionProductContainer");
    const proceed = document.getElementById("btnProceedWeightsCoperion");
    const changeBtn = document.getElementById("btnChangeProducts");
    const modal = document.getElementById("coperionModal");
    const stagePwd = document.getElementById("coperionModalStagePassword");
    const stageChoices = document.getElementById("coperionModalStageProducts");
    const pwdInput = document.getElementById("coperionPassword");
    const errorEl = document.getElementById("coperionError");
    const unlockBtn = document.getElementById("coperionUnlock");
    const cancelBtn = document.getElementById("coperionCancel");
    const doneBtn = document.getElementById("coperionDone");
    const cancelProductsBtn = document.getElementById("coperionCancelProducts");
    const choicesEl = document.getElementById("coperionProductChoices");
    const logoutBtn = document.getElementById("btnLogoutCoperion");
    let continueToWeightsAfterProductSelection = false;

    function getCurrentSelectionContext() {
        return buildProductSelectionContext("compound", "A", true);
    }

    function getSelectionOptions() {
        return {
            allowedProducts: COPERION_PRODUCT_CHOICES,
            defaultProduct: COPERION_DEFAULT_PRODUCT,
            twoSlot: false,
        };
    }

    function applySharedSelectionToState(selection) {
        const normalized = normalizeSharedProductSelection(
            selection,
            getSelectionOptions(),
        );
        state.selectedProduct =
            normalizeCoperionProduct(normalized.primary) || COPERION_DEFAULT_PRODUCT;
        state.productSlots = { primary: state.selectedProduct, secondary: null };
        state.activeProductSlot = "primary";
        state.bigCode = state.selectedProduct;
        return normalized;
    }

    function refreshCoperionUI() {
        renderDefaultProduct();
        document.dispatchEvent(new CustomEvent("updatePreview"));
    }

    async function persistCurrentSelection() {
        const context = getCurrentSelectionContext();
        const payload = buildSharedProductSelectionPayload(
            context,
            { primary: state.selectedProduct, secondary: null },
            getSelectionOptions(),
        );
        const saved = await saveProductSelectionToFirebase(context, payload);
        if (saved) clearLegacyProductSelection(context);
        return saved;
    }

    function selectionMatches(selection, expected) {
        const normalized = normalizeSharedProductSelection(
            selection,
            getSelectionOptions(),
        );
        return normalized.primary === (expected && expected.primary
            ? expected.primary
            : null);
    }

    function subscribeForCurrentContext() {
        const context = getCurrentSelectionContext();
        if (subscribedContextKey === context.key) return;
        unsubscribeProductSelection();
        subscribedContextKey = context.key;
        unsubscribeProductSelection = subscribeToProductSelection(context, (selection) => {
            if (getCurrentSelectionContext().key !== context.key) return;
            const normalized = applySharedSelectionToState(selection);
            refreshCoperionUI();
            if (!selectionMatches(selection, normalized)) {
                void persistCurrentSelection();
            } else if (selection) {
                clearLegacyProductSelection(context);
            }
        });
    }

    // Ensure base selection and numbering context when entering Coperion
    async function prepareCoperionContext() {
        const preserveCurrentUnit =
            state.isCoperion &&
            state.reissueFlowType === "new" &&
            state.lockUnitNumberOnce &&
            String(state.unitNumber || "")
                .trim()
                .toUpperCase()
                .startsWith("EA");
        state.activeGroup = "compound";
        state.source.compound = "A"; // default mapping for Coperion
        state.isCoperion = true;
        const context = getCurrentSelectionContext();
        const options = getSelectionOptions();
        const remoteSelection = await fetchProductSelectionFromFirebase(context);
        const current =
            normalizeCoperionProduct(state.selectedProduct) || null;
        const resolvedSelection =
            (remoteSelection &&
                normalizeSharedProductSelection(remoteSelection, options)) ||
            readLegacyProductSelection(context, options) ||
            normalizeSharedProductSelection(current, options);
        applySharedSelectionToState(resolvedSelection);
        if (!selectionMatches(remoteSelection, resolvedSelection)) {
            const saved = await persistCurrentSelection();
            if (!saved && remoteSelection) {
                clearLegacyProductSelection(context);
            }
        } else if (remoteSelection) {
            clearLegacyProductSelection(context);
        }
        subscribeForCurrentContext();
        if (preserveCurrentUnit) {
            document.dispatchEvent(new CustomEvent("updatePreview"));
            return;
        }
        // Refresh the unit number from Firebase using Coperion-specific numbering
        (async () => {
            try {
                const next = await generateCoperionUnitNumberFromFirebase();
                state.unitNumber = next;
                document.dispatchEvent(new CustomEvent("updatePreview"));
            } catch (e) {
                console.warn(
                    "Failed to fetch next unit number from Firebase (coperion)",
                    e,
                );
            }
        })();
    }

    function renderDefaultProduct() {
        if (!ctn) return;
        ctn.innerHTML = "";
        const b = document.createElement("button");
        b.className = "btn product-btn selected";
        b.textContent = state.selectedProduct || COPERION_DEFAULT_PRODUCT;
        b.addEventListener("click", () => {
            // no-op: single visible product by defaultt
        });
        ctn.appendChild(b);
    }

    function openModal({ requirePassword = true, continueToWeights = false } = {}) {
        if (!modal) return;
        continueToWeightsAfterProductSelection = continueToWeights;
        modal.classList.remove("hidden");
        if (requirePassword) {
            // Reset to password stage each time.
            if (stagePwd) stagePwd.classList.remove("hidden");
            if (stageChoices) stageChoices.classList.add("hidden");
        } else {
            showChoices();
        }
        if (errorEl) errorEl.textContent = "";
        if (pwdInput) {
            pwdInput.value = "";
            if (requirePassword) pwdInput.focus();
        }
    }
    function closeModal() {
        if (!modal) return;
        modal.classList.add("hidden");
        continueToWeightsAfterProductSelection = false;
    }

    function showChoices() {
        if (stagePwd) stagePwd.classList.add("hidden");
        if (stageChoices) stageChoices.classList.remove("hidden");
        if (!choicesEl) return;
        choicesEl.innerHTML = "";
        COPERION_PRODUCT_CHOICES.forEach((prod) => {
            const btn = document.createElement("button");
            btn.className =
                "btn product-btn" +
                (state.selectedProduct === prod ? " selected" : "");
            btn.textContent = prod;
            btn.addEventListener("click", () => {
                choicesEl
                    .querySelectorAll(".btn")
                    .forEach((x) => x.classList.remove("selected"));
                btn.classList.add("selected");
                state.selectedProduct = prod;
                state.productSlots = { primary: prod, secondary: null };
                state.activeProductSlot = "primary";
                state.bigCode = prod;
                refreshCoperionUI();
                void persistCurrentSelection();
            });
            choicesEl.appendChild(btn);
        });
    }

    if (changeBtn)
        changeBtn.addEventListener("click", () => {
            openModal();
        });

    if (cancelBtn) cancelBtn.addEventListener("click", () => closeModal());
    if (cancelProductsBtn)
        cancelProductsBtn.addEventListener("click", () => closeModal());

    if (unlockBtn)
        unlockBtn.addEventListener("click", () => {
            const val = (pwdInput && String(pwdInput.value || "").trim()) || "";
            if (val === "Nylene2026!") {
                showChoices();
            } else {
                if (errorEl) errorEl.textContent = "Incorrect password";
            }
        });

    if (doneBtn)
        doneBtn.addEventListener("click", () => {
            const shouldContinue = continueToWeightsAfterProductSelection;
            continueToWeightsAfterProductSelection = false;
            closeModal();
            renderDefaultProduct();
            if (shouldContinue) {
                state.bigCode = state.selectedProduct || COPERION_DEFAULT_PRODUCT;
                document.dispatchEvent(new CustomEvent("prefillDefaultWeights"));
                showScreen("weights");
                // const gross = document.getElementById("grossWeight");
                // if (gross) gross.focus();
                const net = document.getElementById("netWeight");
                if (net) net.focus();
            }
        });

    if (proceed)
        proceed.addEventListener("click", () => {
            // Bind product to state and move to weight
            state.bigCode = state.selectedProduct || COPERION_DEFAULT_PRODUCT;
            document.dispatchEvent(new CustomEvent("prefillDefaultWeights"));
            showScreen("weights");
            // const gross = document.getElementById("grossWeight");
            // if (gross) gross.focus();
            const net = document.getElementById("netWeight");
            if (net) net.focus();
        });

    // Log out current user from Coperion screen
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

    // Initialize Coperion screen when user navigates to it
    document.addEventListener("enterCoperion", (event) => {
        void (async () => {
            await prepareCoperionContext();
            renderDefaultProduct();
            if (event.detail && event.detail.openProductSelection) {
                openModal({
                    requirePassword: false,
                    continueToWeights:
                        event.detail.continueToWeightsAfterProductSelection,
                });
            }
        })();
    });
}
