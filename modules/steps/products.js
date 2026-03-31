import {
    state,
    showScreen,
    saveProductForContext,
    saveProductSlotsForContext,
    isTwoSlotProductContext,
    getActiveProductFromSlots,
    formatProductForDisplay,
    BLANK_PRODUCT_LABEL,
    syncActiveProductStateFromCurrentContext,
} from "../state.js";

import {
    getProductDescription,
    getProductDisplayLabel,
    getProductRecord,
    getProductName,
    getSelectableProductRecords,
    updateProductRecord,
} from "../product-sync.js";
export function initProductsStep() {
    const back = document.getElementById("backToSource");
    if (back) back.addEventListener("click", () => showScreen("source"));

    const proceed = document.getElementById("btnProceedWeights");
    const productsErrorEl = document.getElementById("productsError");
    const hintEl = document.getElementById("productsHint");
    if (proceed) {
        proceed.addEventListener("click", () => {
            // Guard against BLANK being the active selection (represented as null/empty).
            const active = isTwoSlotProductContext(state.activeGroup)
                ? getActiveProductFromSlots(
                      state.productSlots,
                      state.activeProductSlot,
                  )
                : state.productSlots.primary;

            // If Secondary is selected and is BLANK, block with an inline error under Continue.
            if (
                isTwoSlotProductContext(state.activeGroup) &&
                state.activeProductSlot === "secondary" &&
                !active
            ) {
                if (productsErrorEl)
                    productsErrorEl.textContent =
                        "Select another product that is not BLANK";
                return;
            }

            // Safety: if active slot is BLANK for any reason, don't proceed.
            if (!active) {
                if (productsErrorEl)
                    productsErrorEl.textContent =
                        "Select another product that is not BLANK";
                return;
            }
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
    const productsModalErrorEl = document.getElementById("prProductsError");
    const unlockBtn = document.getElementById("prUnlock");
    const cancelBtn = document.getElementById("prCancel");
    const doneBtn = document.getElementById("prDone");
    const cancelProductsBtn = document.getElementById("prCancelProducts");
    const choicesEl = document.getElementById("prProductChoices");
    const inlineWrap = document.getElementById("productInlineChoicesWrap");
    const inlineChoicesEl = document.getElementById("productInlineChoices");
    const detailsEl = document.getElementById("productDetails");
    const editBtn = document.getElementById("btnPrEditProduct");
    const editModal = document.getElementById("prEditModal");
    const editCodeInput = document.getElementById("prEditCode");
    const editNameInput = document.getElementById("prEditName");
    const editDescriptionInput = document.getElementById("prEditDescription");
    const editErrorEl = document.getElementById("prEditError");
    const editCancelBtn = document.getElementById("prEditCancel");
    const editSaveBtn = document.getElementById("prEditSave");

    // Per-context storage helpers are centralized in state.js

    function syncBigCodeToActiveSlot() {
        const active = isTwoSlotProductContext(state.activeGroup)
            ? getActiveProductFromSlots(
                  state.productSlots,
                  state.activeProductSlot,
              )
            : state.productSlots.primary;
        state.bigCode = active || "";
        // Keep legacy field in sync (best-effort).
        state.selectedProduct = active || null;
    }

    function isInlineSelectionMode() {
        // Only the reissue-new flow requires an operator password already,
        // so we can show all products directly on the page without an extra unlock step.
        return state.reissueFlowType === "new";
    }

    function setInlineSelectionModeUI(on) {
        if (hintEl)
            hintEl.textContent = on
                ? "Select a product."
                : "Only one product is shown by default.";
        if (inlineWrap) inlineWrap.classList.toggle("hidden", !on);
        if (changeBtn) changeBtn.classList.toggle("hidden", on);
        if (editBtn) editBtn.classList.toggle("hidden", on);
    }

    function ensureContextAndDefaultProduct() {
        const group = state.activeGroup;
        const letter = group ? state.source[group] : null;
        const metaEl = document.getElementById("productMeta");
        if (metaEl)
            metaEl.textContent =
                group && letter ? `${group.toUpperCase()} ${letter}` : "";
        syncActiveProductStateFromCurrentContext({ persistDefault: true });
    }

    function setProceedEnabled(enabled) {
        if (proceed) proceed.disabled = !enabled;
    }

    function getPrChoiceRecords() {
        return getSelectableProductRecords("pr");
    }

    function renderProductDetails() {
        if (!detailsEl) return;
        const activeCode = isTwoSlotProductContext(state.activeGroup)
            ? getActiveProductFromSlots(state.productSlots, state.activeProductSlot)
            : state.productSlots.primary;
        if (!activeCode) {
            detailsEl.classList.add("hidden");
            detailsEl.textContent = "";
            return;
        }
        const pieces = [getProductDisplayLabel("pr", activeCode)];
        const name = getProductName("pr", activeCode);
        const description = getProductDescription("pr", activeCode);
        if (name && name !== activeCode) pieces.push(name);
        if (description) pieces.push(description);
        detailsEl.textContent = pieces.filter(Boolean).join(" - ");
        detailsEl.classList.remove("hidden");
    }

    function closeEditModal() {
        if (!editModal) return;
        editModal.classList.add("hidden");
        if (editErrorEl) editErrorEl.textContent = "";
    }

    function openEditModal() {
        const activeCode = isTwoSlotProductContext(state.activeGroup)
            ? getActiveProductFromSlots(state.productSlots, state.activeProductSlot)
            : state.productSlots.primary;
        const record = getProductRecord("pr", activeCode);
        if (!record) {
            if (productsErrorEl) {
                productsErrorEl.textContent =
                    "Select a product before editing its details";
            }
            return;
        }
        if (productsErrorEl) productsErrorEl.textContent = "";
        if (editCodeInput) editCodeInput.value = record.code || "";
        if (editNameInput) editNameInput.value = record.name || "";
        if (editDescriptionInput) {
            editDescriptionInput.value = record.description || "";
        }
        if (editErrorEl) editErrorEl.textContent = "";
        if (editModal) editModal.classList.remove("hidden");
        if (editCodeInput) editCodeInput.focus();
    }

    async function saveEditedProductRecord() {
        const activeCode = isTwoSlotProductContext(state.activeGroup)
            ? getActiveProductFromSlots(state.productSlots, state.activeProductSlot)
            : state.productSlots.primary;
        const record = getProductRecord("pr", activeCode);
        if (!record) {
            if (editErrorEl) editErrorEl.textContent = "Selected product not found";
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
            await updateProductRecord("pr", record.id, { code, name, description });
            closeEditModal();
        } catch (err) {
            console.warn("Failed to update product record", err);
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

    function renderOneSlotProduct() {
        const listEl = document.getElementById("productList");
        if (!listEl) return;
        listEl.innerHTML = "";
        const b = document.createElement("button");
        b.className = "btn product-btn selected";
        b.textContent =
            getProductDisplayLabel("pr", state.productSlots.primary) ||
            formatProductForDisplay(state.productSlots.primary);
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
            }: ${
                value
                    ? getProductDisplayLabel("pr", value) ||
                      formatProductForDisplay(value)
                    : formatProductForDisplay(value)
            }`;
            btn.addEventListener("click", () => {
                if (productsErrorEl) productsErrorEl.textContent = "";
                state.activeProductSlot = slot;
                syncBigCodeToActiveSlot();
                renderProducts();
            });
            return btn;
        };

        listEl.appendChild(makeSlotButton("primary"));
        listEl.appendChild(makeSlotButton("secondary"));

        // Keep Continue enabled as long as Primary is a real product.
        // If Secondary is selected but BLANK, the Continue click handler will show an error.
        setProceedEnabled(!!state.productSlots.primary);
    }

    function renderInlineChoices() {
        if (!inlineChoicesEl) return;
        inlineChoicesEl.innerHTML = "";

        const group = state.activeGroup;
        const letter = group ? state.source[group] : null;
        const isTwoSlot = isTwoSlotProductContext(group);
        const activeSlot =
            state.activeProductSlot === "secondary" ? "secondary" : "primary";
        const current =
            activeSlot === "primary"
                ? state.productSlots.primary
                : state.productSlots.secondary;

        const list = isTwoSlot
            ? [
                  { type: "blank", code: BLANK_PRODUCT_LABEL, label: BLANK_PRODUCT_LABEL },
                  ...getPrChoiceRecords().map((record) => ({
                      type: "product",
                      code: record.code,
                      label: getProductDisplayLabel("pr", record.code) || record.code,
                  })),
              ]
            : getPrChoiceRecords().map((record) => ({
                  type: "product",
                  code: record.code,
                  label: getProductDisplayLabel("pr", record.code) || record.code,
              }));

        list.forEach((entry) => {
            const btn = document.createElement("button");
            const isBlank =
                entry.type === "blank" ||
                String(entry.code).toUpperCase() === BLANK_PRODUCT_LABEL;
            const nextValue = isBlank ? null : entry.code;
            const isSelected = isBlank
                ? !current
                : String(current || "") === String(nextValue);
            btn.className = "btn product-btn" + (isSelected ? " selected" : "");
            btn.textContent = entry.label;
            btn.addEventListener("click", () => {
                if (productsErrorEl) productsErrorEl.textContent = "";

                if (!isTwoSlot) {
                    state.productSlots = { primary: nextValue, secondary: null };
                    state.activeProductSlot = "primary";
                    state.selectedProduct = nextValue;
                    state.bigCode = nextValue || "";
                    saveProductForContext(group, letter, nextValue);
                    renderProducts();
                    return;
                }

                if (activeSlot === "primary" && isBlank) {
                    if (productsErrorEl)
                        productsErrorEl.textContent =
                            "Select another product that is not BLANK";
                    return;
                }

                if (activeSlot === "primary") {
                    state.productSlots.primary = nextValue;
                } else {
                    state.productSlots.secondary = nextValue;
                }
                saveProductSlotsForContext(group, letter, state.productSlots);
                syncBigCodeToActiveSlot();
                renderProducts();
            });
            inlineChoicesEl.appendChild(btn);
        });
    }

    function renderProducts() {
        if (productsErrorEl) productsErrorEl.textContent = "";
        const inline = isInlineSelectionMode();
        setInlineSelectionModeUI(inline);

        if (isTwoSlotProductContext(state.activeGroup)) renderTwoSlotProducts();
        else renderOneSlotProduct();

        if (inline) renderInlineChoices();
        renderProductDetails();
    }

    function openModal() {
        if (!modal) return;
        modal.classList.remove("hidden");
        if (stagePwd) stagePwd.classList.remove("hidden");
        if (stageChoices) stageChoices.classList.add("hidden");
        if (errorEl) errorEl.textContent = "";
        if (productsModalErrorEl) productsModalErrorEl.textContent = "";
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
        if (productsModalErrorEl) productsModalErrorEl.textContent = "";
        if (!choicesEl) return;
        choicesEl.innerHTML = "";

        const activeSlot =
            state.activeProductSlot === "secondary" ? "secondary" : "primary";
        const current =
            activeSlot === "primary"
                ? state.productSlots.primary
                : state.productSlots.secondary;
        const list = isTwoSlotProductContext(state.activeGroup)
            ? [
                  { type: "blank", code: BLANK_PRODUCT_LABEL, label: BLANK_PRODUCT_LABEL },
                  ...getPrChoiceRecords().map((record) => ({
                      type: "product",
                      code: record.code,
                      label: getProductDisplayLabel("pr", record.code) || record.code,
                  })),
              ]
            : getPrChoiceRecords().map((record) => ({
                  type: "product",
                  code: record.code,
                  label: getProductDisplayLabel("pr", record.code) || record.code,
              }));

        list.forEach((entry) => {
            const btn = document.createElement("button");
            const isBlank =
                entry.type === "blank" ||
                String(entry.code).toUpperCase() === BLANK_PRODUCT_LABEL;
            const nextValue = isBlank ? null : entry.code;
            const isSelected = isBlank
                ? !current
                : String(current || "") === String(nextValue);
            btn.className = "btn product-btn" + (isSelected ? " selected" : "");
            btn.textContent = entry.label;
            btn.addEventListener("click", () => {
                choicesEl
                    .querySelectorAll(".btn")
                    .forEach((x) => x.classList.remove("selected"));
                btn.classList.add("selected");
                const group = state.activeGroup;
                const letter = group ? state.source[group] : null;
                if (!isTwoSlotProductContext(group)) {
                    state.productSlots = { primary: nextValue, secondary: null };
                    state.activeProductSlot = "primary";
                    state.selectedProduct = nextValue;
                    state.bigCode = nextValue || "";
                    saveProductForContext(group, letter, nextValue);
                    return;
                }

                if (activeSlot === "primary" && isBlank) {
                    if (productsModalErrorEl)
                        productsModalErrorEl.textContent =
                            "select a product that is not BLANK";
                    // Restore selection highlight to current value/
                    showChoices();
                    return;
                }

                if (activeSlot === "primary") {
                    state.productSlots.primary = nextValue;
                } else {
                    state.productSlots.secondary = nextValue;
                }
                saveProductSlotsForContext(group, letter, state.productSlots);
                syncBigCodeToActiveSlot();
            });
            choicesEl.appendChild(btn);
        });
    }

    if (changeBtn) changeBtn.addEventListener("click", () => openModal());
    if (editBtn) editBtn.addEventListener("click", () => openEditModal());
    if (cancelBtn) cancelBtn.addEventListener("click", () => closeModal());
    if (cancelProductsBtn)
        cancelProductsBtn.addEventListener("click", () => closeModal());
    if (editCancelBtn)
        editCancelBtn.addEventListener("click", () => closeEditModal());
    if (editSaveBtn)
        editSaveBtn.addEventListener("click", () => {
            void saveEditedProductRecord();
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
            const active = getActiveProductFromSlots(
                state.productSlots,
                state.activeProductSlot,
            );
            if (!active) {
                if (productsModalErrorEl)
                    productsModalErrorEl.textContent =
                        "select a product that is not BLANK";
                return;
            }
            closeModal();
            renderProducts();
        });

    document.addEventListener("renderProductList", () => {
        ensureContextAndDefaultProduct();
        renderProducts();
    });
    document.addEventListener("productCatalogSync", () => {
        if (state.isCoperion || !state.activeGroup) return;
        ensureContextAndDefaultProduct();
        renderProducts();
        if (modal && !modal.classList.contains("hidden") && stageChoices) {
            const showingChoices = !stageChoices.classList.contains("hidden");
            if (showingChoices) showChoices();
        }
    });
    document.addEventListener("productSelectionSync", () => {
        if (state.isCoperion || !state.activeGroup) return;
        ensureContextAndDefaultProduct();
        renderProducts();
    });

    // Initial render
    ensureContextAndDefaultProduct();
    renderProducts();
}
