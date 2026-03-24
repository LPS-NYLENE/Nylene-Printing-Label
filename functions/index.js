// Cloud Function to export all printed labels from Realtime Database
// into a single Excel file stored in Cloud Storage at exports/labels.xlsx.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const MAS_HEADER = [
  'DATE',
  'TIME',
  '0',
  '',
  'PRODUCT',
  'UNIT',
  'GROSS LB',
  'NET LB',
  'TARE LB',
  'QTY',
  'MATERIAL',
  'PREFIX',
  '2003',
  'UOM',
];

function formatMasDate(value) {
  const dt = new Date(value || Date.now());
  const safeDate = Number.isNaN(dt.getTime()) ? new Date() : dt;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(safeDate.getMonth() + 1)}/${pad(safeDate.getDate())}/${safeDate
      .getFullYear()
      .toString()
      .slice(-2)}`;
}

function formatMasTime(value) {
  const dt = new Date(value || Date.now());
  const safeDate = Number.isNaN(dt.getTime()) ? new Date() : dt;
  const hours = safeDate.getHours();
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(safeDate.getMinutes()).padStart(2, '0')} ${suffix}`;
}

function formatMasWeight(value) {
  const weight = Number(value || 0);
  return weight.toFixed(1);
}

function resolvePrefixFromUnit(unit) {
  if (!unit || typeof unit !== 'string') return '';
  return unit.slice(0, 2).toUpperCase();
}

function formatMasRow(rec) {
  return [
    formatMasDate(rec && rec.timestamp),
    formatMasTime(rec && rec.timestamp),
    0,
    '',
    rec && rec.product ? rec.product : '',
    rec && rec.unitNumber ? rec.unitNumber : '',
    formatMasWeight(rec && rec.grossLb),
    formatMasWeight(rec && rec.netLb),
    formatMasWeight(rec && rec.tareLb),
    1,
    rec && rec.materialNumber ? String(rec.materialNumber) : '',
    resolvePrefixFromUnit(rec && rec.unitNumber),
    2003,
    'LB',
  ];
}

admin.initializeApp();

function normalizeUnitNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function isReissueRecord(record) {
  return String(record && record.reissueFlag ? record.reissueFlag : '').toUpperCase() === 'RI';
}

function orderRecordsForExcel(records) {
  if (!Array.isArray(records)) return [];
  const decorated = records.map((rec, index) => ({ rec, index }));
  decorated.sort((a, b) => {
    const at = String((a.rec && a.rec.timestamp) || '');
    const bt = String((b.rec && b.rec.timestamp) || '');
    const cmp = bt.localeCompare(at);
    if (cmp !== 0) return cmp;
    return a.index - b.index;
  });

  const baseRecords = [];
  const reissuesByOriginal = new Map();
  const reissuesInOrder = [];
  for (const { rec } of decorated) {
    const isReissue = isReissueRecord(rec);
    const originalKey = normalizeUnitNumber(rec && rec.reissueOriginalUnit);
    if (isReissue && originalKey) {
      if (!reissuesByOriginal.has(originalKey)) reissuesByOriginal.set(originalKey, []);
      reissuesByOriginal.get(originalKey).push(rec);
      reissuesInOrder.push(rec);
    } else {
      baseRecords.push(rec);
    }
  }

  const output = [];
  const attached = new Set();
  const usedOriginals = new Set();
  for (const rec of baseRecords) {
    output.push(rec);
    const unitKey = normalizeUnitNumber(rec && rec.unitNumber);
    if (!unitKey || usedOriginals.has(unitKey)) continue;
    const reissues = reissuesByOriginal.get(unitKey);
    if (reissues && reissues.length) {
      reissues.forEach((r) => attached.add(r));
      output.push(...reissues);
    }
    usedOriginals.add(unitKey);
  }

  for (const rec of reissuesInOrder) {
    if (!attached.has(rec)) output.push(rec);
  }

  return output;
}

exports.exportLabelsToExcel = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  try {
    const db = admin.database();
    const rootSnap = await db.ref('prints').get();

    const records = [];
    if (rootSnap.exists()) {
      rootSnap.forEach((daySnap) => {
        const dayKey = daySnap.key; // YYYY-MM-DD
        daySnap.forEach((printSnap) => {
          const d = printSnap.val() || {};
          records.push({
            id: printSnap.key,
            day: dayKey || '',
            timestamp: d.timestamp || '',
            unitNumber: d.unitNumber || '',
            product: d.product || '',
            materialNumber: d.materialNumber || '',
            sourceGroup: d.sourceGroup || '',
            sourceLetter: d.sourceLetter || '',
            special: d.special || '',
            grossLb: d.grossLb ?? '',
            grossKg: d.grossKg ?? '',
            netLb: d.netLb ?? '',
            netKg: d.netKg ?? '',
            tareLb: d.tareLb ?? '',
            tareKg: d.tareKg ?? '',
            reissueFlag: d.reissueFlag || '',
            reissueOriginalUnit: d.reissueOriginalUnit || '',
          });
        });
      });
    }

    const ordered = orderRecordsForExcel(records);
    const rows = ordered.map(formatMasRow);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([MAS_HEADER, ...rows]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MASOutput');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    const bucket = admin.storage().bucket();
    const file = bucket.file('exports/labels.xlsx');
    await file.save(buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      resumable: false,
      metadata: { cacheControl: 'no-cache' },
    });

    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    res.status(200).json({ downloadUrl, count: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed_to_export' });
  }
});
