// Cloud Function to export all printed labels from Realtime Database
// into a single Excel file stored in Cloud Storage at exports/labels.xlsx.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

admin.initializeApp();

function normalizeUnitNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function isReissueRecord(record) {
  return String(record && record.reissueFlag ? record.reissueFlag : '').toUpperCase() === 'RI';
}

const PR_SOURCE_PREFIXES = new Set([
  'AC',
  'AD',
  'BD',
  'CD',
  'DE',
  'AS',
  'BS',
  'CS',
  'DS',
  'BC',
  'UX',
  'LT',
]);

function normalizePrefix(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function resolveExcelSource(record) {
  const unitPrefix = normalizePrefix(record && record.unitNumber);
  if (unitPrefix === 'EA') return 'Coperion';

  const productPrefix = normalizePrefix(record && record.product);
  if (PR_SOURCE_PREFIXES.has(unitPrefix) || PR_SOURCE_PREFIXES.has(productPrefix)) {
    return 'P&R';
  }

  const productLine = String(record && record.productLine ? record.productLine : '').trim();
  if (productLine === 'Coperion' || productLine === 'P&R') {
    return productLine;
  }

  return '';
}

function orderRecordsForExcel(records) {
  if (!Array.isArray(records)) return [];
  const decorated = records.map((rec, index) => ({ rec, index }));
  decorated.sort((a, b) => {
    const at = String((a.rec && a.rec.timestamp) || '');
    const bt = String((b.rec && b.rec.timestamp) || '');
    const cmp = at.localeCompare(bt);
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
            productLine: d.productLine || '',
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
    const rows = ordered.map((rec) => ({
      id: rec.id,
      day: rec.day,
      timestamp: rec.timestamp,
      unitNumber: rec.unitNumber,
      product: rec.product,
      materialNumber: rec.materialNumber,
      source: resolveExcelSource(rec),
      sourceGroup: rec.sourceGroup,
      sourceLetter: rec.sourceLetter,
      special: rec.special,
      grossLb: rec.grossLb,
      grossKg: rec.grossKg,
      netLb: rec.netLb,
      netKg: rec.netKg,
      tareLb: rec.tareLb,
      tareKg: rec.tareKg,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        'id',
        'day',
        'timestamp',
        'unitNumber',
        'product',
        'materialNumber',
        'source',
        'sourceGroup',
        'sourceLetter',
        'special',
        'grossLb',
        'grossKg',
        'netLb',
        'netKg',
        'tareLb',
        'tareKg',
      ],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Labels');

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
