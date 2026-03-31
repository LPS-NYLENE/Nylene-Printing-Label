import {
    state,
    showScreen,
    loadProductForContext,
    saveProductForContext,
    syncActiveProductStateFromCurrentContext,
} from "../state.js";
import { getAppInstance } from "../firebase-db.js";
import {
    getAuth,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { generateCoperionUnitNumberFromFirebase } from "../utils/generators.js";
import {
    getProductDescription,
    getProductDisplayLabel,
    getProductRecord,
    getSelectableProductRecords,
    updateProductRecord,
} from "../product-sync.js";

const CoperionProductStorageKey = "coperion_selected_product_v1";

function normalizeCoperionProduct(product) {
    return String(product || "").trim() || null;
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
    const detailsEl = document.getElementById("coperionProductDetails");
    const editBtn = document.getElementById("btnEditCoperionProduct");
    const editModal = document.getElementById("coperionEditModal");
    const editCodeInput = document.getElementById("coperionEditCode");
    const editNameInput = document.getElementById("coperionEditName");
    const editDescriptionInput = document.getElementById(
        "coperionEditDescription",
    );
    const editErrorEl = document.getElementById("coperionEditError");
    const editCancelBtn = document.getElementById("coperionEditCancel");
    const editSaveBtn = document.getElementById("coperionEditSave");

    // Legacy local key kept for backward compatibility (read once if contextual empty)

    // Ensure base selection and numbering context when entering Coperion
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
        state.selectedProduct = contextual || current || legacy || null;
        // Always reflect the chosen product in the big code
        syncActiveProductStateFromCurrentContext({ persistDefault: true });
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
        b.textContent =
            getProductDisplayLabel("coperion", state.selectedProduct) ||
            state.selectedProduct ||
            "Select a product";
        b.addEventListener("click", () => {
            // no-op: single visible product by default
        });
        ctn.appendChild(b);
        renderProductDetails();
    }

    function renderProductDetails() {
        if (!detailsEl) return;
        const description = getProductDescription("coperion", state.selectedProduct);
        const label =
            getProductDisplayLabel("coperion", state.selectedProduct) ||
            state.selectedProduct ||
            "";
        if (!label && !description) {
            detailsEl.classList.add("hidden");
            detailsEl.textContent = "";
            return;
        }
        detailsEl.textContent = [label, description].filter(Boolean).join(" - ");
        detailsEl.classList.remove("hidden");
    }

    function closeEditModal() {
        if (!editModal) return;
        editModal.classList.add("hidden");
        if (editErrorEl) editErrorEl.textContent = "";
    }

    function openEditModal() {
        const record = getProductRecord("coperion", state.selectedProduct);
        if (!record) {
            alert("Select a product before editing it.");
            return;
        }
        if (editCodeInput) editCodeInput.value = record.code || "";
        if (editNameInput) editNameInput.value = record.name || "";
        if (editDescriptionInput) {
            editDescriptionInput.value = record.description || "";
        }
        if (editErrorEl) editErrorEl.textContent = "";
        if (editModal) editModal.classList.remove("hidden");
        if (editCodeInput) editCodeInput.focus();
    }

    async function saveEditedProduct() {
        const record = getProductRecord("coperion", state.selectedProduct);
        if (!record) {
            if (editErrorEl) editErrorEl.textContent = "Selected product not found.";
            return;
        }
        const code = String(editCodeInput?.value || "").trim();
        const name = String(editNameInput?.value || "").trim();
        const description = String(editDescriptionInput?.value || "").trim();
        if (!code) {
            if (editErrorEl) editErrorEl.textContent = "Enter a product code.";
            return;
        }
        if (editSaveBtn) {
            editSaveBtn.disabled = true;
            editSaveBtn.textContent = "Saving...";
        }
        try {
            await updateProductRecord("coperion", record.id, {
                code,
                name,
                description,
            });
            closeEditModal();
        } catch (err) {
            console.warn("Failed to save Coperion product", err);
            if (editErrorEl) {
                editErrorEl.textContent =
                    "Unable to save product changes. Please try again.";
            }
        } finally {
            if (editSaveBtn) {
                editSaveBtn.disabled = false;
                editSaveBtn.textContent = "Save";
            }
        }
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
        getSelectableProductRecords("coperion").forEach((record) => {
            const prod = record.code;
            const btn = document.createElement("button");
            btn.className =
                "btn product-btn" +
                (state.selectedProduct === prod ? " selected" : "");
            btn.textContent = getProductDisplayLabel("coperion", prod) || prod;
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
    if (editBtn) editBtn.addEventListener("click", () => openEditModal());

    if (cancelBtn) cancelBtn.addEventListener("click", () => closeModal());
    if (cancelProductsBtn)
        cancelProductsBtn.addEventListener("click", () => closeModal());
    if (editCancelBtn)
        editCancelBtn.addEventListener("click", () => closeEditModal());
    if (editSaveBtn)
        editSaveBtn.addEventListener("click", () => {
            void saveEditedProduct();
        });

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
            closeModal();
            renderDefaultProduct();
        });

    if (proceed)
        proceed.addEventListener("click", () => {
            // Bind product to state and move to weight
            state.bigCode = state.selectedProduct || "";
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
    document.addEventListener("productCatalogSync", () => {
        if (!state.isCoperion) return;
        syncActiveProductStateFromCurrentContext({ persistDefault: true });
        renderDefaultProduct();
        if (modal && !modal.classList.contains("hidden") && stageChoices) {
            const showingChoices = !stageChoices.classList.contains("hidden");
            if (showingChoices) showChoices();
        }
    });
    document.addEventListener("productSelectionSync", () => {
        if (!state.isCoperion) return;
        syncActiveProductStateFromCurrentContext({ persistDefault: true });
        renderDefaultProduct();
    });
}
