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
  return decorated.map(({ rec }) => rec);
}

function formatMasTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const hours = Number.isNaN(date.getTime()) ? 0 : date.getHours();
  const minutes = Number.isNaN(date.getTime()) ? 0 : date.getMinutes();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${pad(minutes)} ${suffix}`;
}

function formatMasWeight(value) {
  const weight = Number(value || 0);
  return weight.toFixed(1);
}

function resolvePrefixFromUnit(unit) {
  if (!unit || typeof unit !== 'string') return '';
  return unit.slice(0, 2).toUpperCase();
}

function formatForMasExcel(rec) {
  const dt = new Date((rec && rec.timestamp) || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}/${dt
    .getFullYear()
    .toString()
    .slice(-2)}`;
  const timeStr = formatMasTime(dt);
  const zero = 0;
  const reissueMarker = isReissueRecord(rec) ? 'RI' : '';
  const product = (rec && rec.product) || '';
  const unit = (rec && rec.unitNumber) || '';
  const grossLb = formatMasWeight(rec && rec.grossLb);
  const netLb = formatMasWeight(rec && rec.netLb);
  const tareLb = formatMasWeight(rec && rec.tareLb);
  const qty = 1;
  const materialNumber = rec && rec.materialNumber ? String(rec.materialNumber) : '';
  const prefix = resolvePrefixFromUnit(unit);
  const code2003 = 2003;
  const unitType = 'LB';
  return [
    dateStr,
    timeStr,
    zero,
    reissueMarker,
    product,
    unit,
    grossLb,
    netLb,
    tareLb,
    qty,
    materialNumber,
    prefix,
    code2003,
    unitType,
  ];
}

function buildMasHeaderAndRows(rows) {
  const header = [
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
  return [header, ...rows];
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
    const rows = ordered.map((rec) => formatForMasExcel(rec));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(buildMasHeaderAndRows(rows));
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
