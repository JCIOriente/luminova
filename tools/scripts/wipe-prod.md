# Production Wipe Runbook — `jci-oriente`

> **DESTRUCTIVE AND IRREVERSIBLE.** No backups are kept. Run only with intent, one
> command at a time, confirming the target before each step. This is never run by an
> automated agent.

Project: `jci-oriente`
Storage bucket: `jci-oriente.firebasestorage.app`

## 1. Confirm the active project
```bash
firebase use jci-oriente
firebase projects:list   # verify jci-oriente is the intended target
```

## 2. Confirm the Storage bucket
```bash
gcloud storage buckets list --project jci-oriente
# Expect: gs://jci-oriente.firebasestorage.app
```

## 3. Wipe Firestore (all collections)
```bash
firebase firestore:delete --all-collections --project jci-oriente
# The CLI prompts for confirmation — read it and type the exact confirmation it asks for.
```

## 4. Wipe Storage objects (keeps the bucket, deletes its contents)
```bash
gcloud storage rm --recursive "gs://jci-oriente.firebasestorage.app/**" --project jci-oriente
```

## 5. Verify empty
```bash
firebase firestore:databases:list --project jci-oriente
gcloud storage ls "gs://jci-oriente.firebasestorage.app"   # expect no objects
```

## Notes
- The Firestore **emulator** data is separate and unaffected; reseed it with
  `pnpm seed:emulator` (emulator must be running).
- After wiping, recreate the initial admin user in the Firebase Console
  (Authentication → Users) — see the console checklist in `docs/firebase-setup.md`.
