import { generateUnitNumberFromFirebase } from "./generators.js";

/**
 * Shared Unextracted / Lactam (Capro) shortcut used by P&R source and
 * Compound A product screens. Sets UX/LT source, product code, fetches the
 * next unit number, then jumps to weights.
 */
export async function runSpecialSourceFlow(state, special, { showScreen }) {
    const key = String(special || "").trim();
    let other = null;
    let bigCode = null;
    if (key === "Unextracted") {
        other = "UX";
        bigCode = "BS640UX";
    } else if (key === "Lactam") {
        other = "LT";
        bigCode = "Capro";
    } else {
        return false;
    }

    state.reissueFlag = "";
    state.reissueOriginalUnit = null;
    state.reissueFlowType = null;
    state.lockUnitNumberOnce = false;

    state.source.special = key;
    state.activeGroup = "other";
    state.source.other = other;
    state.bigCode = bigCode;
    state.selectedProduct = null;
    state.isCoperion = false;

    try {
        state.unitNumber = await generateUnitNumberFromFirebase(
            state.activeGroup,
            state.source.other,
        );
    } catch (e) {
        console.warn(
            "Failed to fetch next unit number from Firebase (special)",
            e,
        );
    }

    document.dispatchEvent(new CustomEvent("prefillDefaultWeights"));
    showScreen("weights");
    document.dispatchEvent(new CustomEvent("focusNetWeight"));
    return true;
}
