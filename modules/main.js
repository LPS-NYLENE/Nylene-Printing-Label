// Entry point: loads screen fragments and initializes step modules
import { state, screens, showScreen } from "./state.js";
import { getAppInstance } from "./firebase-db.js";
import {
    getAuth,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initSourceStep } from "./steps/source.js";
import { initProductsStep } from "./steps/products.js";
import { initWeightsStep } from "./steps/weights.js";
import { initPreviewStep } from "./steps/preview.js";
import { initLabelDatabaseStep } from "./steps/labeldatabase.js";
import { initCoperionStep } from "./steps/coperion.js";
import { initAuthStep } from "./steps/auth.js";
import { applyExcelButtonAccess } from "./access.js";

async function loadFragment(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.text();
}

async function bootstrap() {
    const app = document.getElementById("app");
    const [auth, src, prod, wts, prv, ldb, cop] = await Promise.all([
        loadFragment("/screens/auth.html"),
        loadFragment("/screens/p&rsource.html"),
        loadFragment("/screens/products.html"),
        loadFragment("/screens/weights.html"),
        loadFragment("/screens/preview.html"),
        loadFragment("/screens/labeldatabase.html"),
        loadFragment("/screens/coperion.html"),
    ]);
    app.innerHTML = `${auth}${src}${cop}${prod}${wts}${prv}${ldb}`;

    // Reconnect screen references after HTML injectio
    screens.auth = document.getElementById("screen-auth");
    screens.source = document.getElementById("screen-source");
    screens.products = document.getElementById("screen-products");
    screens.weights = document.getElementById("screen-weights");
    screens.preview = document.getElementById("screen-preview");
    screens.labeldb = document.getElementById("screen-labeldb");
    screens.coperion = document.getElementById("screen-coperion");

    // Initialize steps
    initAuthStep();
    initSourceStep();
    initCoperionStep();
    initProductsStep();
    initWeightsStep();
    initPreviewStep();
    initLabelDatabaseStep();

    // Default to auth screen first; auth state listener will redirect if already logged in
    showScreen("auth");

    // Setup Firebase Auth persistence and auth state handling
    setupAuthLifecycle();
}

bootstrap();

function routeAfterLogin() {
    const lastFlow = localStorage.getItem("last_flow_v1") || "pr";
    if (lastFlow === "cop") {
        state.isCoperion = true;
        showScreen("coperion");
        document.dispatchEvent(new CustomEvent("enterCoperion"));
    } else {
        state.isCoperion = false;
        showScreen("source");
    }
}

function setupAuthLifecycle() {
    const app = getAppInstance();
    const auth = getAuth(app);
    // Ensure persistence is local so sessions survive reloads
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    onAuthStateChanged(auth, (user) => {
        // Update UI access controls for privileged actions.
        applyExcelButtonAccess(user);
        if (user) {
            routeAfterLogin();
        } else {
            showScreen("auth");
        }
    });
}
