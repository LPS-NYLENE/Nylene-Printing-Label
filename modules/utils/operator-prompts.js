function byId(id) {
    return document.getElementById(id);
}

function show(el) {
    if (el) el.classList.remove("hidden");
}

function hide(el) {
    if (el) el.classList.add("hidden");
}

function once(el, event, handler) {
    if (!el) return () => {};
    el.addEventListener(event, handler, { once: true });
    return () => el.removeEventListener(event, handler);
}

export async function confirmYesNo({
    title = "Confirm",
    message = "",
    yesText = "Yes",
    noText = "No",
} = {}) {
    const modal = byId("operatorConfirmModal");
    const titleEl = byId("operatorConfirmTitle");
    const msgEl = byId("operatorConfirmMessage");
    const yesBtn = byId("operatorConfirmYes");
    const noBtn = byId("operatorConfirmNo");

    if (!modal || !yesBtn || !noBtn) {
        // Fallback: browser confirm for non-UI contexts.
        return window.confirm(message || title);
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    yesBtn.textContent = yesText;
    noBtn.textContent = noText;

    show(modal);

    return await new Promise((resolve) => {
        const cleanup = () => hide(modal);
        const onYes = () => {
            cleanup();
            resolve(true);
        };
        const onNo = () => {
            cleanup();
            resolve(false);
        };
        const offYes = once(yesBtn, "click", onYes);
        const offNo = once(noBtn, "click", onNo);
        // Safety: if modal gets hidden externally, resolve false.
        once(modal, "click", (e) => {
            if (e.target === modal) {
                offYes();
                offNo();
                onNo();
            }
        });
    });
}

export async function promptForPassword({
    title = "Enter password",
    expected = "NYLENE",
} = {}) {
    const modal = byId("operatorPasswordModal");
    const titleEl = byId("operatorPasswordTitle");
    const input = byId("operatorPasswordInput");
    const errorEl = byId("operatorPasswordError");
    const cancelBtn = byId("operatorPasswordCancel");
    const confirmBtn = byId("operatorPasswordConfirm");

    if (!modal || !input || !cancelBtn || !confirmBtn) {
        const val = window.prompt(title, "");
        if (val == null) return false;
        return String(val).trim().toUpperCase() === String(expected).trim().toUpperCase();
    }

    if (titleEl) titleEl.textContent = title;
    if (errorEl) errorEl.textContent = "";
    input.value = "";
    show(modal);
    input.focus();

    return await new Promise((resolve) => {
        let settled = false;
        const close = () => hide(modal);
        let offCancel = () => {};
        let offConfirm = () => {};
        const finish = (value) => {
            if (settled) return;
            settled = true;
            try {
                input.removeEventListener("keydown", onKeydown);
            } catch {}
            try {
                offCancel();
            } catch {}
            try {
                offConfirm();
            } catch {}
            close();
            resolve(value);
        };

        const submit = () => {
            const val = String(input.value || "").trim();
            if (val.toUpperCase() !== String(expected).trim().toUpperCase()) {
                if (errorEl) errorEl.textContent = "Incorrect password";
                input.focus();
                return;
            }
            finish(true);
        };

        const cancel = () => {
            finish(false);
        };

        const onKeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        };

        offCancel = once(cancelBtn, "click", cancel);
        offConfirm = once(confirmBtn, "click", submit);
        input.addEventListener("keydown", onKeydown);

        // Clicking backdrop cancels
        once(modal, "click", (e) => {
            if (e.target === modal) cancel();
        });
    });
}

export async function promptForLotNumber({
    title = "Enter lot number",
    initialValue = "",
} = {}) {
    const modal = byId("operatorLotModal");
    const titleEl = byId("operatorLotTitle");
    const input = byId("operatorLotInput");
    const errorEl = byId("operatorLotError");
    const cancelBtn = byId("operatorLotCancel");
    const confirmBtn = byId("operatorLotConfirm");

    if (!modal || !input || !cancelBtn || !confirmBtn) {
        const val = window.prompt(title, initialValue || "");
        if (val == null) return null;
        const out = String(val || "").trim().toUpperCase();
        return out || null;
    }

    if (titleEl) titleEl.textContent = title;
    if (errorEl) errorEl.textContent = "";
    input.value = String(initialValue || "");
    show(modal);
    input.focus();

    return await new Promise((resolve) => {
        let settled = false;
        const close = () => hide(modal);
        let offCancel = () => {};
        let offConfirm = () => {};
        const finish = (value) => {
            if (settled) return;
            settled = true;
            try {
                input.removeEventListener("keydown", onKeydown);
            } catch {}
            try {
                offCancel();
            } catch {}
            try {
                offConfirm();
            } catch {}
            close();
            resolve(value);
        };

        const submit = () => {
            const val = String(input.value || "").trim().toUpperCase();
            if (!val) {
                if (errorEl) errorEl.textContent = "Enter a lot number.";
                input.focus();
                return;
            }
            finish(val);
        };

        const cancel = () => {
            finish(null);
        };

        const onKeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        };

        offCancel = once(cancelBtn, "click", cancel);
        offConfirm = once(confirmBtn, "click", submit);
        input.addEventListener("keydown", onKeydown);

        // Clicking backdrop cancels
        once(modal, "click", (e) => {
            if (e.target === modal) cancel();
        });
    });
}

