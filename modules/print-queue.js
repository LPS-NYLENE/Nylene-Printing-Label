import {
    getDatabase,
    ref,
    onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAppInstance } from "./firebase-db.js";

const PRINT_QUEUE_ROOT = "printQueues";
const REGION = "us-central1";
const PROJECT_ID = "nylene-label-printer";
const CLAIM_INTERVAL_MS = 4000;
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const LEASE_RENEW_MS = 60 * 1000;

function getFunctionsBaseUrl() {
    if (typeof window !== "undefined" && window.APP_FUNCTIONS_URL) {
        return String(window.APP_FUNCTIONS_URL).replace(/\/$/, "");
    }
    return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;
}

async function postJson(path, payload) {
    const endpoint = `${getFunctionsBaseUrl()}/${path}`;
    const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
    });
    if (!resp.ok) {
        let detail = "";
        try {
            detail = await resp.text();
        } catch {
            detail = "";
        }
        throw new Error(
            `Queue request failed (${resp.status}) ${detail || ""}`.trim()
        );
    }
    return await resp.json();
}

function makePrintJobError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function getJobRef(labelKey, jobId) {
    const app = getAppInstance();
    const db = getDatabase(app);
    return ref(db, `${PRINT_QUEUE_ROOT}/${labelKey}/jobs/${jobId}`);
}

export async function enqueuePrintJob({
    labelKey,
    record,
    allowDuplicate = false,
    requestId = null,
}) {
    return await postJson("enqueuePrintJob", {
        labelKey,
        record,
        allowDuplicate: !!allowDuplicate,
        requestId,
    });
}

export async function claimPrintJob({ labelKey, jobId }) {
    return await postJson("claimPrintJob", { labelKey, jobId });
}

export async function renewPrintJobLease({ labelKey, jobId }) {
    return await postJson("renewPrintJobLease", { labelKey, jobId });
}

export async function completePrintJob({ labelKey, jobId, outcome, error }) {
    return await postJson("completePrintJob", {
        labelKey,
        jobId,
        outcome,
        error,
    });
}

export function startPrintJobLeaseRenewal({ labelKey, jobId }) {
    let stopped = false;
    const tick = async () => {
        if (stopped) return;
        try {
            await renewPrintJobLease({ labelKey, jobId });
        } catch (err) {
            console.warn("Print lease renewal failed", err);
        }
    };
    const interval = setInterval(tick, LEASE_RENEW_MS);
    return () => {
        stopped = true;
        clearInterval(interval);
    };
}

export async function waitForPrintJobStart({
    labelKey,
    jobId,
    initialStatus,
    onStatusChange,
}) {
    if (initialStatus === "running") return { status: "running" };
    if (initialStatus === "completed") {
        throw makePrintJobError(
            "job_completed",
            "This label was already printed."
        );
    }
    if (initialStatus === "failed" || initialStatus === "abandoned") {
        throw makePrintJobError(
            "job_failed",
            "The print job could not start."
        );
    }

    let currentStatus = initialStatus || "queued";
    let settled = false;

    return await new Promise((resolve, reject) => {
        const jobRef = getJobRef(labelKey, jobId);
        const stop = (fn, value) => {
            if (settled) return;
            settled = true;
            unsubscribe();
            clearInterval(claimTimer);
            clearTimeout(timeoutTimer);
            fn(value);
        };

        const handler = (snap) => {
            const data = snap.val();
            if (!data) {
                stop(
                    reject,
                    makePrintJobError(
                        "job_missing",
                        "Print job no longer exists."
                    )
                );
                return;
            }
            currentStatus = data.status || currentStatus;
            if (onStatusChange) onStatusChange(data);
            if (currentStatus === "running") {
                stop(resolve, data);
                return;
            }
            if (currentStatus === "completed") {
                stop(
                    reject,
                    makePrintJobError(
                        "job_completed",
                        "This label was already printed."
                    )
                );
                return;
            }
            if (currentStatus === "failed" || currentStatus === "abandoned") {
                stop(
                    reject,
                    makePrintJobError(
                        "job_failed",
                        "The print job could not start."
                    )
                );
            }
        };

        const unsubscribe = onValue(jobRef, handler);

        const claimTimer = setInterval(() => {
            if (settled) return;
            if (currentStatus === "queued") {
                void claimPrintJob({ labelKey, jobId });
            }
        }, CLAIM_INTERVAL_MS);

        const timeoutTimer = setTimeout(() => {
            stop(
                reject,
                makePrintJobError(
                    "job_timeout",
                    "Timed out waiting for the print queue."
                )
            );
        }, WAIT_TIMEOUT_MS);

        if (currentStatus === "queued") {
            void claimPrintJob({ labelKey, jobId });
        }
    });
}

export function createPrintRequestId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const rand = Math.random().toString(36).slice(2);
    return `req-${Date.now().toString(36)}-${rand}`;
}
