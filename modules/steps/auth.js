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
    const chkCoperion = document.getElementById("chkCoperion");
    const btn = document.getElementById("btnAuthLogin");
    const err = document.getElementById("authError");

    if (!email || !pwd || !chkPR || !chkCoperion || !btn) return;

    function setError(msg) {
        if (err) err.textContent = msg || "";
    }

    // Enforce mutual exclusivity
    chkPR.addEventListener("change", () => {
        if (chkPR.checked) chkCoperion.checked = false;
    });
    chkCoperion.addEventListener("change", () => {
        if (chkCoperion.checked) chkPR.checked = false;
    });

    function validate() {
        const pr = chkPR.checked;
        const cop = chkCoperion.checked;
        if (pr && cop) {
            setError("Select either P&R or Coperion, not both");
            return null;
        }
        if (!pr && !cop) {
            setError("Please select P&R or Coperion");
            return null;
        }
        setError("");
        return { pr, cop };
    }

    function proceedNext(sel) {
        if (sel.pr) {
            state.isCoperion = false;
            showScreen("source");
        } else if (sel.cop) {
            state.isCoperion = true;
            showScreen("coperion");
            document.dispatchEvent(new CustomEvent("enterCoperion"));
        }
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
            localStorage.setItem("last_flow_v1", sel.cop ? "cop" : "pr");
            await signInWithEmailAndPassword(auth, userEmail, password);
            // onAuthStateChanged in main.js will route appropriately
        } catch (e) {
            const code = e && e.code ? String(e.code) : "";
            if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
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

    // Hit Enter to logiin
    pwd.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            login();
        }
    });
}
