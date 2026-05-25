import {
    state,
    showScreen,
    isTwoSlotProductContext,
    getActiveProductFromSlots,
    formatProductForDisplay,
    BLANK_PRODUCT_LABEL,
} from "../state.js";
import {
    PR_DEFAULT_PRODUCT,
    PR_PRODUCT_CHOICES,
} from "../catalog/product-choices.js";
import {
    fetchProductSelectionFromFirebase,
    saveProductSelectionToFirebase,
    subscribeToProductSelection,
} from "../firebase-db.js";
import {
    buildProductSelectionContext,
    buildSharedProductSelectionPayload,
    clearLegacyProductSelection,
    normalizeSharedProductSelection,
    readLegacyProductSelection,
} from "../utils/product-selection.js";

let unsubscribeProductSelection = () => {};
let subscribedContextKey = null;

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
    const productSpecialButtons = Array.from(
        document.querySelectorAll("[data-product-special]"),
    );

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

    function getCurrentSelectionContext() {
        const group = state.activeGroup;
        const letter = group ? state.source[group] : null;
        return buildProductSelectionContext(group, letter, false);
    }

    function isCurrentSelectionContext(context) {
        const current = getCurrentSelectionContext();
        return Boolean(current && context && current.key === context.key);
    }

    function getSelectionOptions(group = state.activeGroup) {
        return {
            allowedProducts: PR_PRODUCT_CHOICES,
            defaultProduct: PR_DEFAULT_PRODUCT,
            twoSlot: isTwoSlotProductContext(group),
        };
    }

    function getPersistedSelection(selection, options) {
        return normalizeSharedProductSelection(selection, {
            ...options,
            defaultProduct: null,
        });
    }

    function selectionMatches(selection, expected, options) {
        const normalized = getPersistedSelection(selection, options);
        return (
            normalized.primary === (expected && expected.primary ? expected.primary : null) &&
            normalized.secondary ===
                (expected && expected.secondary ? expected.secondary : null)
        );
    }

    function applySharedSelectionToState(selection, group = state.activeGroup) {
        const options = getSelectionOptions(group);
        const normalized = normalizeSharedProductSelection(selection, options);
        state.productSlots = {
            primary: normalized.primary,
            secondary: options.twoSlot ? normalized.secondary : null,
        };
        if (!options.twoSlot) state.activeProductSlot = "primary";
        syncBigCodeToActiveSlot();
        return normalized;
    }

    async function persistCurrentSelection() {
        const context = getCurrentSelectionContext();
        if (!context) return false;
        const options = getSelectionOptions(context.sourceGroup);
        const payload = buildSharedProductSelectionPayload(
            context,
            state.productSlots,
            options,
        );
        const saved = await saveProductSelectionToFirebase(context, payload);
        if (saved) {
            clearLegacyProductSelection(context);
            return true;
        }
        return false;
    }

    async function persistCurrentSelectionWithCleanupIfNeeded(
        shouldCleanupLegacy = false,
    ) {
        const saved = await persistCurrentSelection();
        if (saved && shouldCleanupLegacy) {
            const context = getCurrentSelectionContext();
            if (context) clearLegacyProductSelection(context);
        }
        return saved;
    }

    function refreshProductsUI() {
        renderProducts();
        document.dispatchEvent(new CustomEvent("updatePreview"));
    }

    function subscribeForCurrentContext() {
        const context = getCurrentSelectionContext();
        const nextKey = context ? context.key : null;
        if (nextKey && subscribedContextKey === nextKey) return;
        unsubscribeProductSelection();
        unsubscribeProductSelection = () => {};
        subscribedContextKey = nextKey;
        if (!context) return;

        unsubscribeProductSelection = subscribeToProductSelection(
            context,
            (selection) => {
                if (!isCurrentSelectionContext(context)) return;
                const options = getSelectionOptions(context.sourceGroup);
                const normalized = applySharedSelectionToState(
                    selection,
                    context.sourceGroup,
                );
                if (selection) clearLegacyProductSelection(context);
                refreshProductsUI();
                if (!selectionMatches(selection, normalized, options)) {
                    void persistCurrentSelectionWithCleanupIfNeeded(!selection);
                }
            },
            () => {},
        );
    }

    async function ensureSharedSelectionForCurrentContext() {
        const context = getCurrentSelectionContext();
        const group = state.activeGroup;
        const letter = group ? state.source[group] : null;
        const metaEl = document.getElementById("productMeta");
        if (metaEl)
            metaEl.textContent =
                group && letter ? `${group.toUpperCase()} ${letter}` : "";
        if (!context) {
            applySharedSelectionToState(null, group);
            return;
        }

        const options = getSelectionOptions(context.sourceGroup);
        const remoteSelection = await fetchProductSelectionFromFirebase(context);
        const resolvedSelection =
            (remoteSelection &&
                normalizeSharedProductSelection(remoteSelection, options)) ||
            readLegacyProductSelection(context, options) ||
            normalizeSharedProductSelection(null, options);

        applySharedSelectionToState(resolvedSelection, context.sourceGroup);
        if (remoteSelection) clearLegacyProductSelection(context);

        if (!selectionMatches(remoteSelection, resolvedSelection, options)) {
            await persistCurrentSelectionWithCleanupIfNeeded(!remoteSelection);
        }
    }

    function setInlineSelectionModeUI(on) {
        if (hintEl)
            hintEl.textContent = on
                ? "Select a product."
                : "Only one product is shown by default.";
        if (inlineWrap) inlineWrap.classList.toggle("hidden", !on);
        if (changeBtn) changeBtn.classList.toggle("hidden", on);
    }

    function setProductSpecialButtonsUI() {
        const isCompoundA =
            state.activeGroup === "compound" &&
            String(state.source.compound || "").toUpperCase() === "A";
        productSpecialButtons.forEach((btn) => {
            btn.classList.toggle("hidden", !isCompoundA);
        });
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
                if (productsErrorEl) productsErrorEl.textContent = "";
                state.activeProductSlot = slot;
                syncBigCodeToActiveSlot();
                renderTwoSlotProducts();
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
                if (productsErrorEl) productsErrorEl.textContent = "";

                if (!isTwoSlot) {
                    state.productSlots = { primary: prod, secondary: null };
                    state.activeProductSlot = "primary";
                    state.selectedProduct = prod;
                    state.bigCode = prod;
                    refreshProductsUI();
                    void persistCurrentSelection();
                    return;
                }

                if (activeSlot === "primary") {
                    state.productSlots.primary = isBlank ? null : prod;
                } else {
                    state.productSlots.secondary = isBlank ? null : prod;
                }
                syncBigCodeToActiveSlot();
                refreshProductsUI();
                void persistCurrentSelection();
            });
            inlineChoicesEl.appendChild(btn);
        });
    }

    function renderProducts() {
        if (productsErrorEl) productsErrorEl.textContent = "";
        const inline = isInlineSelectionMode();
        setInlineSelectionModeUI(inline);
        setProductSpecialButtonsUI();

        if (isTwoSlotProductContext(state.activeGroup)) renderTwoSlotProducts();
        else renderOneSlotProduct();

        if (inline) renderInlineChoices();
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
                    refreshProductsUI();
                    void persistCurrentSelection();
                    return;
                }

                if (activeSlot === "primary") {
                    state.productSlots.primary = isBlank ? null : prod;
                } else {
                    state.productSlots.secondary = isBlank ? null : prod;
                }
                syncBigCodeToActiveSlot();
                refreshProductsUI();
                void persistCurrentSelection();
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
            if (!active && state.activeProductSlot === "secondary") {
                if (productsModalErrorEl)
                    productsModalErrorEl.textContent =
                        "select a product that is not BLANK";
                return;
            }
            closeModal();
            renderProducts();
        });

    document.addEventListener("renderProductList", () => {
        void (async () => {
            await ensureSharedSelectionForCurrentContext();
            subscribeForCurrentContext();
            renderProducts();
        })();
    });

    // Initial render
    renderProducts();
}
