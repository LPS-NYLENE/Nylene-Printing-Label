import { state, showScreen } from "../state.js";
import { parseNumber } from "../utils/format.js";
import { getMaxWeightDifferenceError } from "../utils/weight-validation.js";

export function initWeightsStep() {
    const inputNet = document.getElementById("netWeight");
    const inputGross = document.getElementById("grossWeight");
    const inputTare = document.getElementById("tareWeight");
    let focusedInput = inputNet;
    const weightsError = document.getElementById("weightsError");
    const weightFields = [
        { el: inputNet, label: "net weight (lbs.)" },
        { el: inputGross, label: "gross weight (lbs.)" },
    ];

    function syncWeightsFromInputs() {
        const netRaw = String(inputNet?.value ?? "").trim();
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
        if (!inputNet || !inputGross) return "";
        const netRaw = String(inputNet.value ?? "").trim();
        const grossRaw = String(inputGross.value ?? "").trim();
        if (!netRaw || !grossRaw) return "";
        return state.weights.tareLb < 0 ? "Tare weight cannot be negative" : "";
    }

    function getMaxWeightDifferenceInputError() {
        if (!inputNet || !inputGross) return "";
        const netRaw = String(inputNet.value ?? "").trim();
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
        for (const field of weightFields) {
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

    function prefillDefaultWeights() {
        if (inputNet) inputNet.value = "";
        if (inputGross) inputGross.value = "";
        if (inputTare) inputTare.value = "";
        handleWeightInput();
        clearWeightsError();
    }

    document.addEventListener("prefillDefaultWeights", prefillDefaultWeights);

    weightFields.forEach(({ el, onInput }) => {
        if (!el) return;
        el.addEventListener("focus", () => {
            focusedInput = el;
        });
        el.addEventListener("input", () => {
            if (typeof onInput === "function") onInput();
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
            if (inputGross) inputGross.value = "";
            if (inputTare) inputTare.value = "";
            handleWeightInput();
            clearWeightsError();
        });

    document.querySelectorAll(".keys button").forEach((key) => {
        key.addEventListener("click", () => {
            if (!focusedInput) focusedInput = inputNet;
            if (!focusedInput) return;
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
    if (preview)
        preview.addEventListener("click", () => {
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
            document.dispatchEvent(new CustomEvent("updatePreview"));
            showScreen("preview");
        });
}
