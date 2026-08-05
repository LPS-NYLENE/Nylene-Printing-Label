import { state, showScreen } from "../state.js";
import { parseNumber } from "../utils/format.js";
import { getMaxWeightDifferenceError } from "../utils/weight-validation.js";
import { enterPreviewWithLock } from "../preview-lock.js";

const FIXED_NET_WEIGHTS = ["1800", "2204", "1102", "2204.6"];
const PART_BOX_VALUE = "part-box";
const PR_SOURCE_GROUPS = new Set(["silo", "dryer", "compound", "other"]);

export function initWeightsStep() {
    const inputNet = document.getElementById("netWeight");
    const selectNet = document.getElementById("netWeightSelect");
    const inputGross = document.getElementById("grossWeight");
    const inputTare = document.getElementById("tareWeight");
    let focusedInput = inputNet;
    const weightsError = document.getElementById("weightsError");
    let usesFixedNetWeights = false;

    function isUnextractedSource() {
        const group = String(state.activeGroup || "").toLowerCase();
        const special = String(state.source.special || "").toLowerCase();
        const otherSource = String(state.source.other || "").toUpperCase();
        return (
            group === "other" &&
            (special === "unextracted" || otherSource === "UX")
        );
    }

    function shouldUseFixedNetWeights() {
        const group = String(state.activeGroup || "").toLowerCase();
        return (
            !state.isCoperion &&
            PR_SOURCE_GROUPS.has(group) &&
            !isUnextractedSource()
        );
    }

    function isPartBoxSelected() {
        return (
            usesFixedNetWeights &&
            selectNet &&
            String(selectNet.value || "").trim() === PART_BOX_VALUE
        );
    }

    function syncPartBoxInputVisibility() {
        if (!inputNet) return;
        if (!usesFixedNetWeights) {
            inputNet.classList.remove("hidden");
            inputNet.disabled = false;
            return;
        }
        const showPartBoxInput = isPartBoxSelected();
        inputNet.classList.toggle("hidden", !showPartBoxInput);
        inputNet.disabled = !showPartBoxInput;
        if (!showPartBoxInput) {
            inputNet.value = "";
        }
    }

    function syncNetWeightMode() {
        usesFixedNetWeights = shouldUseFixedNetWeights();
        if (selectNet) {
            selectNet.classList.toggle("hidden", !usesFixedNetWeights);
            selectNet.disabled = !usesFixedNetWeights;
        }
        if (usesFixedNetWeights) {
            if (
                selectNet &&
                inputNet &&
                FIXED_NET_WEIGHTS.includes(String(inputNet.value || "").trim())
            ) {
                selectNet.value = String(inputNet.value).trim();
            }
            syncPartBoxInputVisibility();
            focusedInput = isPartBoxSelected()
                ? inputNet || inputGross
                : selectNet || inputGross || inputNet;
        } else {
            syncPartBoxInputVisibility();
            focusedInput = inputNet || inputGross;
        }
    }

    function getNetControl() {
        if (usesFixedNetWeights && selectNet) {
            return isPartBoxSelected() ? inputNet : selectNet;
        }
        return inputNet;
    }

    function getWeightFields() {
        return [
            { el: getNetControl(), label: "net weight (lbs.)" },
            { el: inputGross, label: "gross weight (lbs.)" },
        ];
    }

    function getNetRaw() {
        const control = getNetControl();
        return String(control?.value ?? "").trim();
    }

    function syncWeightsFromInputs() {
        const netRaw = getNetRaw();
        const grossRaw = String(inputGross?.value ?? "").trim();

        const netLb = parseNumber(netRaw);
        const grossLb = parseNumber(grossRaw);
        state.weights.netLb = netLb;
        state.weights.grossLb = grossLb;

        // Tare weight is derived: tare = gross - net
        // Only compute/display it once both inputs have values to avoid confusing
        // intermediate values while the user is still typing.
        if (netRaw && grossRaw) {
            const tareLb = +((grossLb - netLb).toFixed(1));
            state.weights.tareLb = tareLb;
            if (inputTare) inputTare.value = String(tareLb);
        } else {
            state.weights.tareLb = 0;
            if (inputTare) inputTare.value = "";
        }
    }

    function getNegativeTareError() {
        if (!getNetControl() || !inputGross) return "";
        const netRaw = getNetRaw();
        const grossRaw = String(inputGross.value ?? "").trim();
        if (!netRaw || !grossRaw) return "";
        return state.weights.tareLb < 0 ? "Tare weight cannot be negative" : "";
    }

    function getMaxWeightDifferenceInputError() {
        if (!getNetControl() || !inputGross) return "";
        const netRaw = getNetRaw();
        const grossRaw = String(inputGross.value ?? "").trim();
        if (!netRaw || !grossRaw) return "";
        return getMaxWeightDifferenceError(
            state.weights.netLb,
            state.weights.grossLb,
        );
    }

    function setWeightsError(message = "") {
        if (weightsError) weightsError.textContent = message;
    }

    function clearWeightsError() {
        setWeightsError("");
    }

    function findFirstEmptyWeightInput() {
        if (usesFixedNetWeights && selectNet) {
            const selected = String(selectNet.value || "").trim();
            if (!selected) {
                return { el: selectNet, label: "net weight (lbs.)" };
            }
            if (selected === PART_BOX_VALUE) {
                const partBoxValue = String(inputNet?.value || "").trim();
                if (!partBoxValue) {
                    return { el: inputNet, label: "net weight (lbs.)" };
                }
            }
        }
        for (const field of getWeightFields()) {
            const el = field.el;
            if (!el) continue;
            const value = String(el.value || "").trim();
            if (!value) return field;
        }
        return null;
    }

    function allWeightInputsFilled() {
        return !findFirstEmptyWeightInput();
    }

    function handleWeightInput() {
        syncWeightsFromInputs();
        const tareError = getNegativeTareError();
        if (tareError) {
            setWeightsError(tareError);
            return;
        }
        const maxDifferenceError = getMaxWeightDifferenceInputError();
        if (maxDifferenceError) {
            setWeightsError(maxDifferenceError);
            return;
        }
        if (allWeightInputsFilled()) {
            clearWeightsError();
        }
    }

    function handleNetSelectChange() {
        syncPartBoxInputVisibility();
        if (isPartBoxSelected()) {
            focusedInput = inputNet || inputGross;
            if (inputNet) inputNet.focus();
        } else {
            focusedInput = selectNet || inputGross || inputNet;
        }
        handleWeightInput();
    }

    function prefillDefaultWeights() {
        syncNetWeightMode();
        if (inputNet) inputNet.value = "";
        if (selectNet) selectNet.value = "";
        if (inputGross) inputGross.value = "";
        if (inputTare) inputTare.value = "";
        syncPartBoxInputVisibility();
        focusedInput = getNetControl();
        handleWeightInput();
        clearWeightsError();
    }

    document.addEventListener("prefillDefaultWeights", prefillDefaultWeights);
    document.addEventListener("focusNetWeight", () => {
        syncNetWeightMode();
        const net = getNetControl();
        if (net) net.focus();
    });

    [inputNet, selectNet, inputGross].forEach((el) => {
        if (!el) return;
        el.addEventListener("focus", () => {
            focusedInput = el;
        });
        el.addEventListener("input", () => {
            handleWeightInput();
        });
        el.addEventListener("change", () => {
            if (el === selectNet) {
                handleNetSelectChange();
                return;
            }
            handleWeightInput();
        });
    });

    const clearBtn = document.getElementById("clearWeights");
    if (clearBtn)
        clearBtn.addEventListener("click", () => {
            // During "Reissue New Boxx" flow, Clear cancels the ticket and returns home.
            if (state.reissueFlowType === "new") {
                state.reissueFlag = "";
                state.reissueOriginalUnit = null;
                state.reissueFlowType = null;
                state.lockUnitNumberOnce = false;
                state.reprintAvailable = false;
                state.lastPrinted = null;
                state.previewTimestamp = null;
                showScreen("source");
                return;
            }
            if (inputNet) inputNet.value = "";
            if (selectNet) selectNet.value = "";
            if (inputGross) inputGross.value = "";
            if (inputTare) inputTare.value = "";
            syncPartBoxInputVisibility();
            focusedInput = getNetControl();
            handleWeightInput();
            clearWeightsError();
        });

    document.querySelectorAll(".keys button").forEach((key) => {
        key.addEventListener("click", () => {
            if (!focusedInput) focusedInput = inputNet;
            if (!focusedInput) return;
            if (focusedInput.tagName === "SELECT" || focusedInput.disabled) return;
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

    const back = document.getElementById("backToProducts");
    if (back)
        back.addEventListener("click", () => {
            showScreen(state.isCoperion ? "coperion" : "products");
        });

    const preview = document.getElementById("previewBtn");
    let previewInFlight = false;

    function setPreviewButtonLoading(isLoading) {
        if (!preview) return;
        if (isLoading) {
            if (!preview.dataset.defaultLabel) {
                preview.dataset.defaultLabel = preview.textContent || "Preview";
            }
            preview.disabled = true;
            preview.setAttribute("aria-busy", "true");
            preview.innerHTML =
                '<span class="btn-loading-label"><span class="btn-spinner" aria-hidden="true"></span><span>Checking...</span></span>';
            return;
        }
        preview.disabled = false;
        preview.removeAttribute("aria-busy");
        preview.textContent = preview.dataset.defaultLabel || "Preview";
    }

    if (preview)
        preview.addEventListener("click", async () => {
            if (previewInFlight || preview.disabled) return;
            syncNetWeightMode();
            const missingField = findFirstEmptyWeightInput();
            if (missingField) {
                setWeightsError(`Please enter ${missingField.label}.`);
                if (missingField.el) missingField.el.focus();
                return;
            }
            syncWeightsFromInputs();
            const tareError = getNegativeTareError();
            if (tareError) {
                setWeightsError(tareError);
                if (inputGross) inputGross.focus();
                return;
            }
            const maxDifferenceError = getMaxWeightDifferenceInputError();
            if (maxDifferenceError) {
                setWeightsError(maxDifferenceError);
                if (inputGross) inputGross.focus();
                return;
            }
            clearWeightsError();
            previewInFlight = true;
            setPreviewButtonLoading(true);
            try {
                const entered = await enterPreviewWithLock({
                    isCoperion: state.isCoperion,
                });
                if (!entered.ok) {
                    setWeightsError(entered.message);
                    return;
                }
                document.dispatchEvent(new CustomEvent("updatePreview"));
            } finally {
                previewInFlight = false;
                setPreviewButtonLoading(false);
            }
        });
}
