const QR_SIZE_PX = 120;

export function drawQrCode(container, text) {
    if (!container) return;
    const payload = String(text || "");
    container.replaceChildren();
    if (!payload) return;
    if (!window.QRCode || typeof window.QRCode.toString !== "function") {
        return;
    }

    try {
        window.QRCode.toString(
            payload,
            {
                type: "svg",
                margin: 1,
                width: QR_SIZE_PX,
                errorCorrectionLevel: "M",
                color: {
                    dark: "#000000",
                    light: "#ffffff",
                },
            },
            (err, svg) => {
                if (err || !svg) return;
                container.innerHTML = svg;
                const svgEl = container.querySelector("svg");
                if (svgEl) {
                    svgEl.setAttribute("role", "img");
                    svgEl.setAttribute("aria-label", `QR code ${payload}`);
                }
            },
        );
    } catch (e) {
        console.warn("Failed to render QR code", e);
    }
}
