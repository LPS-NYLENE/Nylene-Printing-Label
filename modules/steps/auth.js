import { state, showScreen } from "../state.js";
import { getAppInstance } from "../firebase-db.js";
import {
    getAuth,
    signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function initAuthStep() {
    const email = document.getElementById("authEmail");
    const pwd = document.getElementById("authPassword");
    const chkPR = document.getElementById("chkPR");
    const chkCompoundA = document.getElementById("chkCompoundA");
    const chkCompoundB = document.getElementById("chkCompoundB");
    const chkCoperion = document.getElementById("chkCoperion");
    const btn = document.getElementById("btnAuthLogin");
    const err = document.getElementById("authError");

    if (
        !email ||
        !pwd ||
        !chkPR ||
        !chkCompoundA ||
        !chkCompoundB ||
        !chkCoperion ||
        !btn
    )
        return;

    const flowOptions = [
        { input: chkPR, flow: "pr" },
        { input: chkCompoundA, flow: "compound-a" },
        { input: chkCompoundB, flow: "compound-b" },
        { input: chkCoperion, flow: "cop" },
    ];

    function setError(msg) {
        if (err) err.textContent = msg || "";
    }

    function restoreLastFlowCheckbox() {
        const lastFlow = localStorage.getItem("last_flow_v1") || "";
        flowOptions.forEach(({ input, flow }) => {
            input.checked = flow === lastFlow;
        });
    }

    restoreLastFlowCheckbox();

    // Enforce mutual exclusivity
    flowOptions.forEach(({ input }) => {
        input.addEventListener("change", () => {
            if (!input.checked) return;
            flowOptions.forEach((option) => {
                if (option.input !== input) option.input.checked = false;
            });
        });
    });

    function validate() {
        const selected = flowOptions.filter(({ input }) => input.checked);
        if (selected.length > 1) {
            setError("Select one area only");
            return null;
        }
        if (selected.length === 0) {
            setError("Please select an area");
            return null;
        }
        setError("");
        return selected[0].flow;
    }

    function proceedNext(flow) {
        if (flow === "cop") {
            state.isCoperion = true;
            showScreen("coperion");
            document.dispatchEvent(new CustomEvent("enterCoperion"));
            return;
        }
        state.isCoperion = false;
        showScreen("source");
        document.dispatchEvent(new CustomEvent("configureSourceView"));
    }

    async function login() {
        const sel = validate();
        if (!sel) return;
        const app = getAppInstance();
        const auth = getAuth(app);
        const userEmail = String(email.value || "").trim();
        const password = String(pwd.value || "");
        try {
            setError("");
            // Persist last flow selection for post-login routing
            localStorage.setItem("last_flow_v1", sel);
            await signInWithEmailAndPassword(auth, userEmail, password);
            proceedNext(sel);
            // onAuthStateChanged in main.js will keep the routed screen in sync.
        } catch (e) {
            const code = e && e.code ? String(e.code) : "";
            if (
                code === "auth/invalid-credential" ||
                code === "auth/wrong-password"
            ) {
                setError("Invalid email or password");
            } else if (code === "auth/user-not-found") {
                setError("User not found");
            } else if (code === "auth/network-request-failed") {
                setError("Network error, please try again");
            } else {
                setError("Login failed. Please try again");
            }
        }
    }

    btn.addEventListener("click", login);

    // Hit Enter to login
    pwd.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            login();
        }
    });
}
