# Domains

Each app is reachable on two hostnames: the chapter's own domain, which is the one we
publish, and the Firebase default, which Firebase Hosting always serves and which is the
fallback. Both hostnames of an app point at the **same** deploy — there is nothing to
redeploy for a hostname to start or keep working.

| App | Canonical (published) | Firebase default (fallback, always live) | Hosting target |
|-----|-----------------------|------------------------------------------|----------------|
| spotlight | https://jcioriente.org | https://jcioriente.web.app | `jcioriente` |
| backstage | https://admin.jcioriente.org | https://jcioriente-backstage.web.app | `jcioriente-backstage` |

"Canonical" means the hostname the code announces: the one search engines index, WhatsApp
share cards link to, and the public site's "Ingresar" / "Portal de miembros" links open.

## Where the domain lives in code

One file: `apps/spotlight/src/config/external-links.ts`.

```ts
export const SITE_URL = "https://jcioriente.org";
export const BACKSTAGE_URL = "https://admin.jcioriente.org";
```

- `SITE_URL` is stamped into `apps/spotlight/index.html` (`rel=canonical`, `og:url`,
  `og:image`, `twitter:image` — written as `__SITE_URL__` there) and into the generated
  `sitemap.xml` and `robots.txt`, by the `seoFiles` Vite plugin
  (`apps/spotlight/seo-files.ts`). `seo-files.test.ts` fails if a hardcoded origin comes
  back into `index.html`, or if a static page route is missing from the sitemap.
- `BACKSTAGE_URL` is the header and footer link from the public site into the admin.

Nothing else links to a hostname:

- **Invite links** are built from `window.location.origin`, so an operator on
  `admin.jcioriente.org` issues `admin.jcioriente.org` links, and one on the fallback
  issues fallback links. Both redeem.
- **`VITE_FIREBASE_AUTH_DOMAIN`** stays `jci-oriente.firebaseapp.com`. Firebase Auth uses it
  only for popup/redirect sign-in providers, and backstage signs in with Email/Password
  only.
- **beacon** has no hostname configuration.

Two places name the domain without linking to it, and are updated by hand on a switch:

- `.github/workflows/deploy.yml` — the `production` environment `url`, the link GitHub
  shows on a deploy.
- `apps/backstage/src/features/members/components/self-profile-form.tsx` — the member
  profile hint "sección Directiva de jcioriente.org".

## Console settings that must list every hostname

Keep **both** hostnames of each app in these lists — the fallback has to work the moment
it is needed, not after a console change.

| Where | Entry | What breaks if a hostname is missing |
|-------|-------|--------------------------------------|
| reCAPTCHA admin (https://www.google.com/recaptcha/admin) → the spotlight key → Domains | `jcioriente.org`, `jcioriente.web.app` | App Check tokens fail on that hostname. The contact form and push opt-in write to Firestore, so they are refused once Firestore App Check enforcement is turned on (it is off today) |
| reCAPTCHA admin → the backstage key → Domains | `admin.jcioriente.org`, `jcioriente-backstage.web.app` | App Check tokens fail on the three enforced callables (invites included) and on Storage, which enforces App Check (member photo uploads). The SDK then **throttles App Check for 24 hours** in that browser; only a page reload after the fix clears it |
| Firebase console → Authentication → Settings → Authorized domains | all four hostnames | Auth operations that validate the origin are refused |
| Google Cloud console → APIs & Services → Credentials → the browser API key → Website restrictions (only if restrictions are set) | all four hostnames | Every Firebase call from that hostname fails |
| Firebase console → Hosting → each site → Custom domains | `jcioriente.org` on `jcioriente`, `admin.jcioriente.org` on `jcioriente-backstage` | The custom hostname stops serving (DNS / certificate) |

The DNS records the custom domains need are shown in the Hosting custom-domain dialog;
they live at the domain registrar.

## Falling back to the Firebase domains

Use this when the custom domain is unavailable — expired registration, broken DNS, a
certificate that will not provision.

**Immediately:** nothing needs deploying. `jcioriente.web.app` and
`jcioriente-backstage.web.app` keep serving the current build. Tell members to use the
backstage fallback URL.

**Then point the code at the fallback**, so search engines, share cards and the public
site's admin link stop sending people to the dead hostname:

1. In a worktree off `main`, edit `apps/spotlight/src/config/external-links.ts`:

   ```ts
   export const SITE_URL = "https://jcioriente.web.app";
   export const BACKSTAGE_URL = "https://jcioriente-backstage.web.app";
   ```

2. Update the two hand-maintained mentions listed under "Where the domain lives in code",
   the "Canonical" column of the table at the top of this file, and the admin URL in
   `docs/negocio/manual-administracion.md`.
3. Open a PR and merge it. The Deploy workflow redeploys hosting (`docs/ci-cd.md`); in an
   emergency, `pnpm deploy:hosting` (`docs/firebase-setup.md`, "Deploying").
4. Verify in a browser:
   - `https://jcioriente.web.app` → view source: `rel="canonical"` and `og:url` show the
     fallback hostname.
   - `https://jcioriente.web.app/sitemap.xml` and `/robots.txt` list the fallback hostname.
   - The header "Ingresar" and footer "Portal de miembros" links open
     `https://jcioriente-backstage.web.app`.
5. Review the URLs stored as **data**, which no deploy touches: backstage `/config` holds
   the public links page (`/linktree`) and the contact/social URLs. Point any that use the
   dead hostname at the fallback.

Returning to the custom domain is the same procedure with the canonical values.

## What users notice on a hostname change

A browser treats each hostname as a separate site, so on the new hostname:

- Backstage users sign in again — the session lives in the old hostname's storage.
- An installed app (PWA) keeps opening the hostname it was installed from. Reinstall from
  the new one.
- Push notifications: a browser subscription belongs to the hostname it was granted on.
  Members who want push on the new hostname enable it there.
- Already-shared links, including unredeemed invite links, keep working as long as their
  hostname serves.
