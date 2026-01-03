import {
    state,
    showScreen,
    loadProductForContext,
    saveProductForContext,
    loadProductSlotsForContext,
    saveProductSlotsForContext,
    isTwoSlotProductContext,
    getActiveProductFromSlots,
    formatProductForDisplay,
    BLANK_PRODUCT_LABEL,
} from "../state.js";

// Default fallback when no prior selection exists for a context
const PR_DEFAULT_PRODUCT = "CSDN-INT";

// Allowed products for P&R (from provided list )
const PR_PRODUCT_CHOICES = [
    "CSDN-INT",
    "BS700D",
    "BS640T",
    "BS640A",
    "BS640AFOIL",
    "BS600CSDN",
    "BS700AFOIL",
    "BS700RA",
    "BX3WQ662X",
    "BX3WQ662",
    "BX3WQ662XBAGS",
    "BX3WQ662BAGS",
    "WASTE",
    "OLIGOMERS",
    "SLUDGE",
    "UNEXT-CHIP",
    "CAPRO",
    "BS700R80",
    "BS640UX",
    "BX3RF",
    "PA6-205",
    "BS700A",
    "BX3WQ662X-02BAGS",
    "L-195-1",
    "L-195-2",
    "L-196",
    "700D-INT",
    "INT 190",
];

export function initProductsStep() {
    const back = document.getElementById("backToSource");
    if (back) back.addEventListener("click", () => showScreen("source"));

    const proceed = document.getElementById("btnProceedWeights");
    if (proceed) {
        proceed.addEventListener("click", () => {
            document.dispatchEvent(new CustomEvent("prefillDefaultWeights"));
            showScreen("weights");
            const gross = document.getElementById("grossWeight");
            if (gross) gross.focus();
        });
    }

    // Modal + change buttons
    const changeBtn = document.getElementById("btnPrChangeProducts");
    const modal = document.getElementById("prModal");
    const stagePwd = document.getElementById("prModalStagePassword");
    const stageChoices = document.getElementById("prModalStageProducts");
    const pwdInput = document.getElementById("prPassword");
    const errorEl = document.getElementById("prError");
    const unlockBtn = document.getElementById("prUnlock");
    const cancelBtn = document.getElementById("prCancel");
    const doneBtn = document.getElementById("prDone");
    const cancelProductsBtn = document.getElementById("prCancelProducts");
    const choicesEl = document.getElementById("prProductChoices");

    // Per-context storage helpers are centralized in state.js

    function syncBigCodeToActiveSlot() {
        const active = isTwoSlotProductContext(state.activeGroup)
            ? getActiveProductFromSlots(
                  state.productSlots,
                  state.activeProductSlot
              )
            : state.productSlots.primary;
        state.bigCode = active || "";
        // Keep legacy field in sync (best-effort).
        state.selectedProduct = active || null;
    }

    function ensureContextAndDefaultProduct() {
        const group = state.activeGroup;
        const letter = group ? state.source[group] : null;
        const metaEl = document.getElementById("productMeta");
        if (metaEl)
            metaEl.textContent =
                group && letter ? `${group.toUpperCase()} ${letter}` : "";

        if (isTwoSlotProductContext(group)) {
            const savedSlots = loadProductSlotsForContext(group, letter);
            const primary = savedSlots.primary || PR_DEFAULT_PRODUCT;
            const secondary = savedSlots.secondary || null;
            state.productSlots = { primary, secondary };
            if (state.activeProductSlot !== "secondary")
                state.activeProductSlot = "primary";
            // Persist the normalized slots in case we migrated from legacy single value.
            saveProductSlotsForContext(group, letter, state.productSlots);
            syncBigCodeToActiveSlot();
            return;
        }

        // Bulk / Silo remains single-slot.
        const savedForContext = loadProductForContext(group, letter);
        const product = savedForContext || PR_DEFAULT_PRODUCT;
        state.productSlots = { primary: product, secondary: null };
        state.activeProductSlot = "primary";
        state.selectedProduct = product;
        state.bigCode = product;
    }

    function setProceedEnabled(enabled) {
        if (proceed) proceed.disabled = !enabled;
    }

    function renderOneSlotProduct() {
        const listEl = document.getElementById("productList");
        if (!listEl) return;
        listEl.innerHTML = "";
        const b = document.createElement("button");
        b.className = "btn product-btn selected";
        b.textContent = state.productSlots.primary || PR_DEFAULT_PRODUCT;
        listEl.appendChild(b);
        setProceedEnabled(!!state.productSlots.primary);
    }

    function renderTwoSlotProducts() {
        const listEl = document.getElementById("productList");
        if (!listEl) return;
        listEl.innerHTML = "";

        const makeSlotButton = (slot) => {
            const isPrimary = slot === "primary";
            const value = isPrimary
                ? state.productSlots.primary
                : state.productSlots.secondary;
            const btn = document.createElement("button");
            const selected = state.activeProductSlot === slot;
            btn.className = "btn product-btn" + (selected ? " selected" : "");
            btn.textContent = `${
                isPrimary ? "Primary" : "Secondary"
            }: ${formatProductForDisplay(value)}`;
            btn.addEventListener("click", () => {
                state.activeProductSlot = slot;
                syncBigCodeToActiveSlot();
                renderTwoSlotProducts();
            });
            return btn;
        };

        listEl.appendChild(makeSlotButton("primary"));
        listEl.appendChild(makeSlotButton("secondary"));

        const active = getActiveProductFromSlots(
            state.productSlots,
            state.activeProductSlot
        );
        setProceedEnabled(!!active);
    }

    function renderProducts() {
        if (isTwoSlotProductContext(state.activeGroup)) {
            renderTwoSlotProducts();
        } else {
            renderOneSlotProduct();
        }
    }

    function openModal() {
        if (!modal) return;
        modal.classList.remove("hidden");
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

        const activeSlot =
            state.activeProductSlot === "secondary" ? "secondary" : "primary";
        const current =
            activeSlot === "primary"
                ? state.productSlots.primary
                : state.productSlots.secondary;
        const list = isTwoSlotProductContext(state.activeGroup)
            ? [BLANK_PRODUCT_LABEL, ...PR_PRODUCT_CHOICES]
            : PR_PRODUCT_CHOICES.slice();

        list.forEach((prod) => {
            const btn = document.createElement("button");
            const isBlank = String(prod).toUpperCase() === BLANK_PRODUCT_LABEL;
            const isSelected = isBlank
                ? !current
                : String(current || "") === String(prod);
            btn.className = "btn product-btn" + (isSelected ? " selected" : "");
            btn.textContent = prod;
            btn.addEventListener("click", () => {
                choicesEl
                    .querySelectorAll(".btn")
                    .forEach((x) => x.classList.remove("selected"));
                btn.classList.add("selected");
                const group = state.activeGroup;
                const letter = group ? state.source[group] : null;
                if (!isTwoSlotProductContext(group)) {
                    state.productSlots = { primary: prod, secondary: null };
                    state.activeProductSlot = "primary";
                    state.selectedProduct = prod;
                    state.bigCode = prod;
                    saveProductForContext(group, letter, prod);
                    return;
                }

                if (activeSlot === "primary" && isBlank) {
                    alert("Primary slot cannot be BLANK.");
                    // Restore selection highlight to current value
                    showChoices();
                    return;
                }

                if (activeSlot === "primary") {
                    state.productSlots.primary = isBlank ? null : prod;
                } else {
                    state.productSlots.secondary = isBlank ? null : prod;
                }
                saveProductSlotsForContext(group, letter, state.productSlots);
                syncBigCodeToActiveSlot();
            });
            choicesEl.appendChild(btn);
        });
    }

    if (changeBtn) changeBtn.addEventListener("click", () => openModal());
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
            renderProducts();
        });

    document.addEventListener("renderProductList", () => {
        ensureContextAndDefaultProduct();
        renderProducts();
    });

    // Initial render
    ensureContextAndDefaultProduct();
    renderProducts();
}
