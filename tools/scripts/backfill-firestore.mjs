#!/usr/bin/env node

/**
 * Backfill Firestore data to align with the latest schema changes.
 *
 * Usage:
 *   node tools/scripts/backfill-firestore.mjs [--dry-run]
 *
 * Environment:
 *   - GOOGLE_APPLICATION_CREDENTIALS: Path to a service account JSON
 *   - or FIREBASE_SERVICE_ACCOUNT: JSON string with service account credentials
 *   - FIREBASE_PROJECT_ID: Optional override for the project ID
 *
 * The script performs two migrations:
 *   1. Ensures every member document has `active: true` and `deletedAt: null`.
 *   2. Converts legacy event `startDate` and `endDate` fields into Firestore Timestamp values.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  initializeApp,
  applicationDefault,
  cert,
} from 'firebase-admin/app';
import {
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');

function resolveCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const json =
      typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : process.env.FIREBASE_SERVICE_ACCOUNT;
    return cert(json);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const buffer = readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
    return cert(JSON.parse(buffer));
  }

  return applicationDefault();
}

function initFirebase() {
  const credential = resolveCredential();

  initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  return getFirestore();
}

function toTimestamp(value) {
  if (!value) return null;

  if (value instanceof Timestamp) {
    return value;
  }

  if (value.toDate instanceof Function) {
    return Timestamp.fromDate(value.toDate());
  }

  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }

  return null;
}

async function backfillMembers(db) {
  const snapshot = await db.collection('members').get();
  const updates = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const payload = {};

    if (data.active === undefined) {
      payload.active = true;
    }

    if (!Object.prototype.hasOwnProperty.call(data, 'deletedAt')) {
      payload.deletedAt = null;
    }

    if (Object.keys(payload).length > 0) {
      updates.push({ ref: doc.ref, payload });
    }
  });

  if (updates.length === 0) {
    console.log('Members: no changes required.');
    return;
  }

  console.log(`Members: ${updates.length} document(s) need updates.`);

  if (DRY_RUN) {
    updates.forEach(({ ref, payload }) => {
      console.log(`  - ${ref.path}`, payload);
    });
    return;
  }

  for (const update of updates) {
    await update.ref.update(update.payload);
  }
}

async function backfillEvents(db) {
  const snapshot = await db.collection('events').get();
  const updates = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const startDate = toTimestamp(data.startDate);
    const endDate = toTimestamp(data.endDate);
    const payload = {};

    if (startDate && (!(data.startDate instanceof Timestamp) || data.startDate.toMillis() !== startDate.toMillis())) {
      payload.startDate = startDate;
    }

    if (endDate && (!(data.endDate instanceof Timestamp) || data.endDate.toMillis() !== endDate.toMillis())) {
      payload.endDate = endDate;
    }

    if (Object.keys(payload).length > 0) {
      updates.push({ ref: doc.ref, payload });
    }
  });

  if (updates.length === 0) {
    console.log('Events: no changes required.');
    return;
  }

  console.log(`Events: ${updates.length} document(s) need timestamp updates.`);

  if (DRY_RUN) {
    updates.forEach(({ ref, payload }) => {
      console.log(`  - ${ref.path}`, {
        startDate: payload.startDate?.toDate().toISOString(),
        endDate: payload.endDate?.toDate().toISOString(),
      });
    });
    return;
  }

  for (const update of updates) {
    await update.ref.update(update.payload);
  }
}

async function run() {
  try {
    const db = initFirebase();

    await backfillMembers(db);
    await backfillEvents(db);

    if (DRY_RUN) {
      console.log('Dry run complete. No changes written.');
    } else {
      console.log('Backfill complete.');
    }
    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

run();
