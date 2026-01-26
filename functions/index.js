// Cloud Function to export all printed labels from Realtime Database
// into a single Excel file stored in Cloud Storage at exports/labels.xlsx.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const XLSX = require('xlsx');

admin.initializeApp();

exports.exportLabelsToExcel = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  try {
    const db = admin.database();
    const rootSnap = await db.ref('prints').get();

    const rows = [];
    if (rootSnap.exists()) {
      rootSnap.forEach((daySnap) => {
        const dayKey = daySnap.key; // YYYY-MM-DD
        daySnap.forEach((printSnap) => {
          const d = printSnap.val() || {};
          rows.push({
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
          });
        });
      });
    }

    rows.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        'id',
        'day',
        'timestamp',
        'unitNumber',
        'product',
        'materialNumber',
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
