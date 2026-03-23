import {
    state,
    showScreen,
    loadProductForContext,
    saveProductForContext,
} from "../state.js";
import { getAppInstance } from "../firebase-db.js";
import {
    getAuth,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { generateCoperionUnitNumberFromFirebase } from "../utils/generators.js";
import {
    COPERION_DEFAULT_PRODUCT,
    COPERION_PRODUCT_CHOICES,
} from "../catalog/product-choices.js";

const CoperionProductStorageKey = "coperion_selected_product_v1";

function normalizeCoperionProduct(product) {
    const normalized = String(product || "").trim();
    return COPERION_PRODUCT_CHOICES.includes(normalized) ? normalized : null;
}

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

    // Legacy local key kept for backward compatibility (read once if contextual empty)

    // Ensure base selection and numbering context when entering Coperionn
    function prepareCoperionContext() {
        state.activeGroup = "compound";
        state.source.compound = "A"; // default mapping for Coperion
        state.isCoperion = true;
        const group = state.activeGroup;
        const letter = state.source.compound;
        const contextual = normalizeCoperionProduct(
            loadProductForContext(group, letter),
        );
        // If nothing in contextual store, fall back to older single-key stores once.
        const legacy = (function legacyRead() {
            try {
                return normalizeCoperionProduct(
                    localStorage.getItem(CoperionProductStorageKey),
                );
            } catch {
                return null;
            }
        })();
        const current = normalizeCoperionProduct(state.selectedProduct);
        state.selectedProduct =
            contextual || current || legacy || COPERION_DEFAULT_PRODUCT;
        saveProductForContext(group, letter, state.selectedProduct);
        // Always reflect the chosen product in the big code
        state.bigCode = state.selectedProduct;
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
            // no-op: single visible product by default
        });
        ctn.appendChild(b);
    }

    function openModal() {
        if (!modal) return;
        modal.classList.remove("hidden");
        // Reset to password stage each time
        if (stagePwd) stagePwd.classList.remove("hidden");
        if (stageChoices) stageChoices.classList.add("hidden");
        if (errorEl) errorEl.textContent = "";
        if (pwdInput) {
            pwdInput.value = "";
            pwdInput.focus();
        }
    }
    function closeModal() {
        if (!modal) return;
        modal.classList.add("hidden");
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
                state.bigCode = prod;
                const group = state.activeGroup;
                const letter = state.source.compound;
                saveProductForContext(group, letter, prod);
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
            if (val.toUpperCase() === "NYLENE") {
                showChoices();
            } else {
                if (errorEl) errorEl.textContent = "Incorrect password";
            }
        });

    if (doneBtn)
        doneBtn.addEventListener("click", () => {
            closeModal();
            renderDefaultProduct();
        });

    if (proceed)
        proceed.addEventListener("click", () => {
            // Bind product to state and move to weight
            state.bigCode = state.selectedProduct || COPERION_DEFAULT_PRODUCT;
            document.dispatchEvent(new CustomEvent("prefillDefaultWeights"));
            showScreen("weights");
            const gross = document.getElementById("grossWeight");
            if (gross) gross.focus();
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
    document.addEventListener("enterCoperion", () => {
        prepareCoperionContext();
        renderDefaultProduct();
    });
}
