# Firebase Setup

## Project

Firebase project ID: `jci-oriente`

## Hosting Targets

| Target | App | URL |
|--------|-----|-----|
| `jcioriente` | spotlight | https://jcioriente.web.app |
| `jcioriente-backstage` | backstage | https://jcioriente-backstage.web.app |

## Initial Setup (one-time)

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login
firebase login

# Set project
firebase use jci-oriente

# Apply hosting targets
firebase target:apply hosting jcioriente jcioriente
firebase target:apply hosting jcioriente-backstage jcioriente-backstage
```

## Environment Variables

### Frontend Apps (apps/spotlight, apps/backstage)

Create `.env.local` in each app directory (never commit these):

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=jci-oriente.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=jci-oriente
VITE_FIREBASE_STORAGE_BUCKET=jci-oriente.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_EMULATOR_ENABLED=false
```

For local development with emulators, set `VITE_FIREBASE_EMULATOR_ENABLED=true`.

### Beacon (apps/beacon)

Cloud Functions use Application Default Credentials — no env file needed.
For local emulator, the Firebase CLI handles credentials automatically.

## Emulators

### Start All Emulators

```bash
firebase emulators:start
```

| Service | Port | URL |
|---------|------|-----|
| Auth | 4030 | — |
| Firestore | 4010 | — |
| Functions | 4020 | — |
| Hosting | 4000 | http://localhost:4000 |
| Emulator UI | 4100 | http://localhost:4100 |

### Import/Export Emulator Data

```bash
# Export current emulator state
firebase emulators:export ./emulator-data

# Start with existing data
firebase emulators:start --import=./emulator-data
```

## Deploying

### Deploy Everything

```bash
pnpm build
firebase deploy
```

### Deploy Hosting Only

```bash
pnpm --filter spotlight build
pnpm --filter backstage build
firebase deploy --only hosting
```

### Deploy Functions Only

```bash
pnpm --filter beacon build
firebase deploy --only functions
```

### Deploy Specific Hosting Target

```bash
firebase deploy --only hosting:jcioriente
firebase deploy --only hosting:jcioriente-backstage
```

## Firestore Rules Deploy

```bash
firebase deploy --only firestore:rules
```

## Firebase Auth Setup

In Firebase Console → Authentication → Sign-in method:
- Enable **Email/Password** provider
- No other providers needed

Create initial admin users manually in Firebase Console → Authentication → Users.

## Firestore Indexes

Current `firestore.indexes.json` — add composite indexes as needed:

```json
{
  "indexes": [
    {
      "collectionGroup": "members",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

## Storage Rules

Default Storage rules should restrict to authenticated users:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /members/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Backfill Script

For migrating existing Firestore data when schema changes:

```bash
# Preview changes (dry run)
node tools/scripts/backfill-firestore.mjs --dry-run

# Apply changes
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
  node tools/scripts/backfill-firestore.mjs
```
