// Lightweight Firebase Realtime Database helper for browser usage
// Uses Firebase v9+ CDN ESM modules to avoid bundler setup

// IMPORTANT: Ensure your Realtime Database exists for the project and its URL:
//   https://nylene-label-printer-default-rtdb.firebaseio.com

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  serverTimestamp,
  get,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAcNqa-rlwixUAsS7hTGsXaqiC8ELMVJXw",
  authDomain: "nylene-label-printer.firebaseapp.com",
  databaseURL: "https://nylene-label-printer-default-rtdb.firebaseio.com",
  projectId: "nylene-label-printer",
  storageBucket: "nylene-label-printer.firebasestorage.app",
  messagingSenderId: "906222982085",
  appId: "1:906222982085:web:5c9808ced0307256c0b1ac",
};

export function getAppInstance() {
  const apps = getApps();
  if (apps.length) return apps[0];
  return initializeApp(firebaseConfig);
}

export async function savePrintToFirebase(record) {
  try {
    const app = getAppInstance();
    const db = getDatabase(app);

    const iso = record && record.timestamp ? record.timestamp : new Date().toISOString();
    const day = iso.slice(0, 10); // YYYY-MM-DD
    const printsRef = ref(db, `prints/${day}`);

    const payload = {
      ...record,
      _createdAt: serverTimestamp(),
    };

    await push(printsRef, payload);
    return true;
  } catch (err) {
    console.warn("Firebase save failed", err);
    return false;
  }
}

// Fetch all print logs from Realtime Database and return as a flat array
// Sorted by timestamp ascending. Each item mirrors the schema saved by
// savePrintToFirebase.
export async function fetchAllPrintsFromFirebase() {
  const app = getAppInstance();
  const db = getDatabase(app);
  const rootRef = ref(db, "prints");
  const snap = await get(rootRef);
  const rows = [];
  if (snap.exists()) {
    snap.forEach((daySnap) => {
      const dayKey = daySnap.key || ""; // YYYY-MM-DD
      daySnap.forEach((printSnap) => {
        const d = printSnap.val() || {};
        rows.push({
          id: printSnap.key,
          day: dayKey,
          ...d,
        });
      });
    });
  }
  rows.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  return rows;
}

// Compute the next daily sequence (last three digits) for a given date
// by inspecting existing prints for that UTC day in Realtime Database.
// Returns 1 if no prior prints exist for the day.
export async function getNextDailySequenceFromFirebase(date) {
  const app = getAppInstance();
  const db = getDatabase(app);
  const input = date instanceof Date ? date : new Date(date || Date.now());
  // Apply the app's 00:01 rule: 00:00-00:01 belongs to previous day
  const effective = new Date(input);
  const minutesSinceMidnight = effective.getHours() * 60 + effective.getMinutes();
  if (minutesSinceMidnight < 1) {
    effective.setMinutes(effective.getMinutes() - 1);
  }
  // Local day boundaries
  const start = new Date(effective);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Build the Coperion EA prefix for this day so we can exclude it from P&R sequence
  const yearDigit = String(effective.getFullYear()).slice(-1);
  const doyStr = String(getDayOfYear(effective)).padStart(3, "0");
  const coperionPrefixForDay = `EA1${yearDigit}${doyStr}`;

  // Determine which UTC day buckets to read (at most two, sometimes one)
  const dayKeys = new Set();
  const startKey = start.toISOString().slice(0, 10);
  const endKey = new Date(end.getTime() - 1).toISOString().slice(0, 10);
  dayKeys.add(startKey);
  dayKeys.add(endKey);

  const refs = Array.from(dayKeys).map((k) => ref(db, `prints/${k}`));
  const snaps = await Promise.all(refs.map((r) => get(r)));

  // For P&R: ignore any Coperion records (identified by explicit productLine or EA prefix)
  let maxSuffix = 0;
  let anyParseable = false;
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    snap.forEach((child) => {
      const val = child.val() || {};
      const ts = val.timestamp;
      if (!ts) return;
      const t = new Date(ts).getTime();
      if (!(t >= start.getTime() && t < end.getTime())) return;
      const unit = String(val.unitNumber || "");
      const productLine = String(val.productLine || "");
      const isCoperion = productLine === "Coperion" || unit.startsWith(coperionPrefixForDay);
      if (isCoperion) return; // exclude Coperion numbers from P&R sequence calculation
      const suffixStr = unit.slice(-3);
      const n = parseInt(suffixStr, 10);
      if (Number.isFinite(n)) {
        anyParseable = true;
        if (n > maxSuffix) maxSuffix = n;
      }
    });
  }
  if (anyParseable) return Math.min(999, maxSuffix + 1);

  // If no parseable P&R units found inside boundary, count only P&R records to provide next number
  let count = 0;
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    snap.forEach((child) => {
      const val = child.val() || {};
      const ts = val.timestamp;
      if (!ts) return;
      const t = new Date(ts).getTime();
      if (!(t >= start.getTime() && t < end.getTime())) return;
      const unit = String(val.unitNumber || "");
      const productLine = String(val.productLine || "");
      const isCoperion = productLine === "Coperion" || unit.startsWith(coperionPrefixForDay);
      if (!isCoperion) count += 1;
    });
  }
  return Math.min(999, count + 1);
}

// Helper: day-of-year (1..365/366)
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diffMs = date - start;
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.floor(diffMs / oneDayMs) + 1;
}

// Compute the next Coperion daily sequence (last three digits) for the given date.
// Rules:
// - Prefix for Coperion: EA + 1 + last-digit-of-year + day-of-year (DDD)
// - Last three digits start at 401 each new day (00:01 rule applies)
// - Increments based on existing records in DB that match the day's EA prefix
// - Returns the next suffix within 401..999
export async function getNextCoperionSequenceFromFirebase(date) {
  const app = getAppInstance();
  const db = getDatabase(app);
  const input = date instanceof Date ? date : new Date(date || Date.now());

  // Apply 00:01 rule: 00:00-00:01 belongs to previous day
  const effective = new Date(input);
  const minutesSinceMidnight = effective.getHours() * 60 + effective.getMinutes();
  if (minutesSinceMidnight < 1) {
    effective.setMinutes(effective.getMinutes() - 1);
  }

  // Local day boundaries
  const start = new Date(effective);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Build the EA prefix for the day: EA1[Y][DDD]
  const yearDigit = String(effective.getFullYear()).slice(-1);
  const doyStr = String(getDayOfYear(effective)).padStart(3, "0");
  const prefix = `EA1${yearDigit}${doyStr}`;

  // Determine which UTC day buckets to read (at most two, sometimes one)
  const dayKeys = new Set();
  const startKey = start.toISOString().slice(0, 10);
  const endKey = new Date(end.getTime() - 1).toISOString().slice(0, 10);
  dayKeys.add(startKey);
  dayKeys.add(endKey);

  const refs = Array.from(dayKeys).map((k) => ref(db, `prints/${k}`));
  const snaps = await Promise.all(refs.map((r) => get(r)));

  let maxSuffix = 0;
  let anyParseable = false;
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    snap.forEach((child) => {
      const val = child.val() || {};
      const ts = val.timestamp;
      if (!ts) return;
      const t = new Date(ts).getTime();
      if (!(t >= start.getTime() && t < end.getTime())) return;
      const unit = String(val.unitNumber || "");
      if (!unit.startsWith(prefix)) return;
      const suffixStr = unit.slice(-3);
      const n = parseInt(suffixStr, 10);
      if (Number.isFinite(n)) {
        anyParseable = true;
        if (n > maxSuffix) maxSuffix = n;
      }
    });
  }
  if (anyParseable) return Math.min(999, maxSuffix + 1);

  // If none parseable matched, count EA-prefixed records for the boundary and offset from 401
  let count = 0;
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    snap.forEach((child) => {
      const val = child.val() || {};
      const ts = val.timestamp;
      if (!ts) return;
      const t = new Date(ts).getTime();
      if (!(t >= start.getTime() && t < end.getTime())) return;
      const unit = String(val.unitNumber || "");
      if (unit.startsWith(prefix)) count += 1;
    });
  }
  // First of day -> 401, then 402, ... (capped at 999)
  return Math.min(999, 401 + count);
}
