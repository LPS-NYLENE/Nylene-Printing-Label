// Cloud Function to export all printed labels from Realtime Database
// into a single Excel file stored in Cloud Storage at exports/labels.xlsx.

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const XLSX = require('xlsx');

admin.initializeApp();

const PRINT_QUEUE_ROOT = 'printQueues';
const PRINT_QUEUE_LEASE_MS = 5 * 60 * 1000;
const SAFE_KEY_REGEX = /^[^.#$\[\]/]+$/;
const MAX_ERROR_LENGTH = 500;

function assertSafeKey(value, name) {
  if (!value || typeof value !== 'string' || !SAFE_KEY_REGEX.test(value)) {
    const label = name || 'key';
    throw new Error(`invalid_${label}`);
  }
}

function normalizeRecordValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeRecordNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Number(n.toFixed(1));
}

function normalizePrintRecord(record) {
  const rec = record && typeof record === 'object' ? record : {};
  return {
    unitNumber: normalizeRecordValue(rec.unitNumber),
    product: normalizeRecordValue(rec.product),
    productLine: normalizeRecordValue(rec.productLine),
    sourceGroup: normalizeRecordValue(rec.sourceGroup),
    sourceLetter: normalizeRecordValue(rec.sourceLetter),
    special: normalizeRecordValue(rec.special),
    grossLb: normalizeRecordNumber(rec.grossLb),
    netLb: normalizeRecordNumber(rec.netLb),
    tareLb: normalizeRecordNumber(rec.tareLb),
    reissueFlag: normalizeRecordValue(rec.reissueFlag),
  };
}

function buildRecordSignature(labelKey, record) {
  const rec = normalizePrintRecord(record);
  return [
    labelKey,
    rec.unitNumber,
    rec.product,
    rec.productLine,
    rec.sourceGroup,
    rec.sourceLetter,
    rec.special,
    rec.grossLb,
    rec.netLb,
    rec.tareLb,
    rec.reissueFlag,
  ].join('|');
}

function computeRecordFingerprint(labelKey, record) {
  const signature = buildRecordSignature(labelKey, record);
  return crypto.createHash('sha256').update(signature).digest('hex');
}

function buildIdempotencyKey({ labelKey, record, allowDuplicate, requestId }) {
  if (allowDuplicate) {
    assertSafeKey(requestId, 'requestId');
    return `req:${requestId}`;
  }
  const fingerprint = computeRecordFingerprint(labelKey, record);
  return `rec:${labelKey}:${fingerprint}`;
}

async function readQueueFirstJob(queueRef) {
  const snap = await queueRef.orderByKey().limitToFirst(1).get();
  let nextJobId = null;
  snap.forEach((child) => {
    if (!nextJobId) nextJobId = child.key;
  });
  return nextJobId;
}

function trimErrorMessage(message) {
  if (!message) return '';
  const text = String(message);
  if (text.length <= MAX_ERROR_LENGTH) return text;
  return text.slice(0, MAX_ERROR_LENGTH);
}

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

exports.enqueuePrintJob = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const labelKey = normalizeRecordValue(body.labelKey);
    assertSafeKey(labelKey, 'labelKey');
    const allowDuplicate = !!body.allowDuplicate;
    const requestId = normalizeRecordValue(body.requestId);
    const record = normalizePrintRecord(body.record);
    const idempotencyKey = buildIdempotencyKey({
      labelKey,
      record,
      allowDuplicate,
      requestId,
    });
    assertSafeKey(idempotencyKey, 'idempotencyKey');

    const db = admin.database();
    const queueRoot = db.ref(`${PRINT_QUEUE_ROOT}/${labelKey}`);
    const idempotencyRef = queueRoot.child(`idempotency/${idempotencyKey}`);
    const jobsRef = queueRoot.child('jobs');
    const proposedJobId = jobsRef.push().key;
    if (!proposedJobId) {
      res.status(500).json({ error: 'job_id_failed' });
      return;
    }
    const now = Date.now();

    let jobId = proposedJobId;
    const idempotencyTxn = await idempotencyRef.transaction((current) => {
      if (current && current.jobId) return;
      return { jobId: proposedJobId, createdAt: now };
    }, { applyLocally: false });

    if (!idempotencyTxn.committed) {
      const existing = idempotencyTxn.snapshot.val() || (await idempotencyRef.get()).val();
      jobId = existing && existing.jobId ? existing.jobId : proposedJobId;
      const existingSnap = await queueRoot.child(`jobs/${jobId}`).get();
      const existingJob = existingSnap.val() || {};
      res.status(200).json({
        jobId,
        status: existingJob.status || 'queued',
        idempotencyKey,
      });
      return;
    }

    const jobData = {
      jobId,
      labelKey,
      status: 'queued',
      allowDuplicate,
      idempotencyKey,
      record,
      enqueuedAt: now,
    };
    await queueRoot.child(`jobs/${jobId}`).set(jobData);

    const activeRef = queueRoot.child('active');
    let staleJobId = null;
    const activeTxn = await activeRef.transaction((current) => {
      const leaseExpired =
        !current || !current.leaseExpiresAt || current.leaseExpiresAt <= now;
      if (leaseExpired) {
        if (current && current.jobId) staleJobId = current.jobId;
        return {
          jobId,
          leaseExpiresAt: now + PRINT_QUEUE_LEASE_MS,
          startedAt: now,
        };
      }
      return;
    }, { applyLocally: false });

    let status = 'queued';
    const becameActive =
      activeTxn.committed && activeTxn.snapshot.val()?.jobId === jobId;
    if (becameActive) {
      status = 'running';
      await Promise.all([
        queueRoot.child(`queue/${jobId}`).remove(),
        queueRoot.child(`jobs/${jobId}`).update({
          status,
          startedAt: now,
          leaseExpiresAt: now + PRINT_QUEUE_LEASE_MS,
        }),
      ]);
    } else {
      await queueRoot.child(`queue/${jobId}`).set(true);
    }

    if (becameActive && staleJobId && staleJobId !== jobId) {
      await queueRoot.child(`jobs/${staleJobId}`).update({
        status: 'abandoned',
        finishedAt: now,
        error: 'lease_expired',
      });
    }

    res.status(200).json({ jobId, status, idempotencyKey });
  } catch (err) {
    console.error('enqueuePrintJob failed', err);
    res.status(400).json({ error: 'enqueue_failed' });
  }
});

exports.claimPrintJob = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const labelKey = normalizeRecordValue(body.labelKey);
    const jobId = normalizeRecordValue(body.jobId);
    assertSafeKey(labelKey, 'labelKey');
    assertSafeKey(jobId, 'jobId');

    const db = admin.database();
    const queueRoot = db.ref(`${PRINT_QUEUE_ROOT}/${labelKey}`);
    const jobRef = queueRoot.child(`jobs/${jobId}`);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists()) {
      res.status(404).json({ error: 'job_not_found' });
      return;
    }
    const job = jobSnap.val() || {};
    if (job.status === 'running') {
      res.status(200).json({ jobId, status: 'running' });
      return;
    }
    if (job.status !== 'queued') {
      res.status(200).json({ jobId, status: job.status || 'queued' });
      return;
    }

    const queueRef = queueRoot.child('queue');
    const nextJobId = await readQueueFirstJob(queueRef);
    if (nextJobId && nextJobId !== jobId) {
      res.status(200).json({ jobId, status: 'queued' });
      return;
    }

    const now = Date.now();
    const activeRef = queueRoot.child('active');
    let staleJobId = null;
    const activeTxn = await activeRef.transaction((current) => {
      const leaseExpired =
        !current || !current.leaseExpiresAt || current.leaseExpiresAt <= now;
      if (leaseExpired) {
        if (current && current.jobId) staleJobId = current.jobId;
        return {
          jobId,
          leaseExpiresAt: now + PRINT_QUEUE_LEASE_MS,
          startedAt: now,
        };
      }
      return;
    }, { applyLocally: false });

    const becameActive =
      activeTxn.committed && activeTxn.snapshot.val()?.jobId === jobId;
    if (becameActive) {
      await Promise.all([
        queueRoot.child(`queue/${jobId}`).remove(),
        jobRef.update({
          status: 'running',
          startedAt: now,
          leaseExpiresAt: now + PRINT_QUEUE_LEASE_MS,
        }),
      ]);
      if (staleJobId && staleJobId !== jobId) {
        await queueRoot.child(`jobs/${staleJobId}`).update({
          status: 'abandoned',
          finishedAt: now,
          error: 'lease_expired',
        });
      }
      res.status(200).json({ jobId, status: 'running' });
      return;
    }

    res.status(200).json({ jobId, status: 'queued' });
  } catch (err) {
    console.error('claimPrintJob failed', err);
    res.status(400).json({ error: 'claim_failed' });
  }
});

exports.renewPrintJobLease = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const labelKey = normalizeRecordValue(body.labelKey);
    const jobId = normalizeRecordValue(body.jobId);
    assertSafeKey(labelKey, 'labelKey');
    assertSafeKey(jobId, 'jobId');

    const db = admin.database();
    const queueRoot = db.ref(`${PRINT_QUEUE_ROOT}/${labelKey}`);
    const activeRef = queueRoot.child('active');
    const now = Date.now();
    const activeSnap = await activeRef.get();
    const active = activeSnap.val();
    if (!active || active.jobId !== jobId) {
      res.status(200).json({ jobId, status: 'not_active' });
      return;
    }
    const leaseExpiresAt = now + PRINT_QUEUE_LEASE_MS;
    await Promise.all([
      activeRef.update({ leaseExpiresAt }),
      queueRoot.child(`jobs/${jobId}`).update({ leaseExpiresAt }),
    ]);
    res.status(200).json({ jobId, status: 'renewed', leaseExpiresAt });
  } catch (err) {
    console.error('renewPrintJobLease failed', err);
    res.status(400).json({ error: 'renew_failed' });
  }
});

exports.completePrintJob = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const body = req.body || {};
    const labelKey = normalizeRecordValue(body.labelKey);
    const jobId = normalizeRecordValue(body.jobId);
    assertSafeKey(labelKey, 'labelKey');
    assertSafeKey(jobId, 'jobId');

    const outcome = normalizeRecordValue(body.outcome) || 'completed';
    const error = trimErrorMessage(body.error);
    const db = admin.database();
    const queueRoot = db.ref(`${PRINT_QUEUE_ROOT}/${labelKey}`);
    const jobRef = queueRoot.child(`jobs/${jobId}`);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists()) {
      res.status(404).json({ error: 'job_not_found' });
      return;
    }
    const now = Date.now();
    await Promise.all([
      jobRef.update({
        status: outcome,
        finishedAt: now,
        error: error || null,
      }),
      queueRoot.child(`queue/${jobId}`).remove(),
    ]);

    const activeRef = queueRoot.child('active');
    let activeCleared = false;
    const activeTxn = await activeRef.transaction((current) => {
      if (current && current.jobId === jobId) {
        activeCleared = true;
        return null;
      }
      return;
    }, { applyLocally: false });
    if (activeTxn.committed) activeCleared = true;

    let nextJobId = null;
    if (activeCleared) {
      const queueRef = queueRoot.child('queue');
      nextJobId = await readQueueFirstJob(queueRef);
      if (nextJobId) {
        const claimTxn = await activeRef.transaction((current) => {
          const leaseExpired =
            !current || !current.leaseExpiresAt || current.leaseExpiresAt <= now;
          if (leaseExpired) {
            return {
              jobId: nextJobId,
              leaseExpiresAt: now + PRINT_QUEUE_LEASE_MS,
              startedAt: now,
            };
          }
          return;
        }, { applyLocally: false });
        if (claimTxn.committed && claimTxn.snapshot.val()?.jobId === nextJobId) {
          await Promise.all([
            queueRoot.child(`queue/${nextJobId}`).remove(),
            queueRoot.child(`jobs/${nextJobId}`).update({
              status: 'running',
              startedAt: now,
              leaseExpiresAt: now + PRINT_QUEUE_LEASE_MS,
            }),
          ]);
        }
      }
    }

    res.status(200).json({ jobId, status: outcome, nextJobId });
  } catch (err) {
    console.error('completePrintJob failed', err);
    res.status(400).json({ error: 'complete_failed' });
  }
});
