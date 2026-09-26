# Eternal Cyberia | Quantum Dither License Server

This Vercel service bridges Payhip/Zapier purchases to Quantum Dither Synth.
Zapier synchronizes every Payhip license into PostgreSQL, and After Effects
calls `/api/activate` for an immediate decision.

The service stores an HMAC-SHA256 hash of each license rather than the plaintext
key. The first successful activation binds the license to one random device ID.
Version 1.1 also supports the reusable Eternal Cyberia desktop installer.

## Architecture

```text
Payhip New Sale -> Zapier -> POST /api/sync-license -> PostgreSQL
After Effects ----------------> POST /api/activate -> valid true/false
Payhip Refund --> Zapier -> POST /api/sync-license -> active false
```

Installer additions:

```text
Installer -> POST /api/installer-resolve   -> product/profile (no seat change)
Installer -> POST /api/installer-authorize -> bind/check device + signed package URL
Installer -> private Vercel Blob URL        -> signed MSI or notarized PKG
```

Set `EC_INSTALLER_CATALOG_JSON` using `.env.installer.example`. For the recommended
private Blob configuration, connect that Blob store to this project so Vercel can
issue a pathname-scoped GET URL valid for ten minutes. Public HTTPS artifact URLs
are also accepted, but do not provide download gating.

Zapier Tables can remain your human-readable dashboard, but the Vercel database
is the low-latency validation source. In the purchase Zap, create/update the
Zapier Table row and then POST the same fields to Vercel.

## 1. Deploy to Vercel

1. Create a private GitHub repository and put this project's files at its root.
2. In Vercel, select **Add New > Project**, import the repository, and deploy it.
3. Open the project's **Storage** or **Marketplace** page and add a PostgreSQL
   provider such as Neon. Connect it to this project so Vercel creates a
   `DATABASE_URL` environment variable.
4. Open the provider's SQL editor and run all of `schema.sql`.
5. In **Project Settings > Environment Variables**, add:

   - `QDS_SYNC_SECRET`: a random secret of at least 32 characters.
   - `QDS_LICENSE_PEPPER`: a different random secret of at least 32 characters.
   - `QDS_PRODUCT_CODE`: `quantum-dither-synth`.

6. Apply the variables to Production, Preview, and Development if you intend to
   test every environment. Redeploy after adding them.
7. Visit `https://YOUR-PROJECT.vercel.app/api/health`. A working database returns:

```json
{"ok":true,"service":"quantum-dither-license"}
```

Never expose `QDS_SYNC_SECRET`, `QDS_LICENSE_PEPPER`, or `DATABASE_URL` in the
After Effects source, Zap output, screenshots, or a public repository.

## 2. Configure the Payhip purchase Zap

Use the existing Zap whose trigger is **Payhip > New Sale**. After its product
filter and optional Zapier Tables action, add an action:

- App: **Webhooks by Zapier**
- Event: **POST**
- URL: `https://YOUR-PROJECT.vercel.app/api/sync-license`
- Payload type: `json`

Map this payload:

| Key | Value |
| --- | --- |
| `license_key` | Payhip's license-code field from the New Sale trigger |
| `order_id` | Payhip transaction/order ID |
| `customer_email` | Payhip buyer email |
| `product` | `quantum-dither-synth` |
| `active` | `true` |
| `reset_device` | `false` |

Add this header:

| Header | Value |
| --- | --- |
| `x-qds-sync-secret` | the exact `QDS_SYNC_SECRET` value from Vercel |

If the simple POST action does not expose custom headers, use **Webhooks by
Zapier > Custom Request**, select POST, and enter the same JSON and header.

Important: test the Payhip trigger and confirm it actually exposes the code the
buyer received. Map that exact field. If no license-code field exists in the
trigger sample, do not substitute the product secret or order ID; add a license
issuance step before this request.

## 3. Configure refunds

Create a second Zap:

1. Trigger: **Payhip > Refund**.
2. Filter: Quantum Dither Synth product ID.
3. Action: **Webhooks by Zapier > POST**.
4. Use the same `/api/sync-license` URL and secret header.
5. Send the order ID, product, and `active` set to `false`. The refund trigger
   does not need to provide the license key because the server revokes by the
   original order ID.

The next online validation will reject that license.

## 4. Configure the After Effects plug-in

In `AfterEffectsSDK/ZapierLicenseConfig.h` use the Vercel activation endpoint,
not a Zapier Catch Hook:

```cpp
#define QDS_ZAPIER_WEBHOOK_CONFIGURED 1
#define QDS_ZAPIER_WEBHOOK_URL L"https://YOUR-PROJECT.vercel.app/api/activate"
#define QDS_ZAPIER_PRODUCT_CODE "quantum-dither-synth"
#define QDS_ZAPIER_CACHE_MINUTES 60
```

Rebuild Release x64, replace the installed `.aex`, and restart After Effects.

## 5. Test before launch

1. Make a Payhip test purchase and copy its license.
2. Check that the Zapier POST action returns `synced: true`.
3. In the database, confirm a row exists. `license_hash` should contain a
   64-character hash, not the customer's key.
4. Enter the key in the plug-in. The first use should return `valid: true` and
   bind `device_id`.
5. Try a fake key; it must return HTTP 403 and `valid: false`.
6. Run the refund Zap and confirm the real key is rejected afterward.

To move a legitimate customer to a new computer, rerun the authorized sync
request for their order with `reset_device` set to `true`.

Back up `QDS_LICENSE_PEPPER`. Changing or losing it invalidates every stored
license hash. Rotating `QDS_SYNC_SECRET` is safe after updating the Zap actions.

## Local validation

```bash
npm install
npm test
npm run check
```

For local API testing, copy `.env.example` to `.env.local`, fill in private
values, run `vercel dev`, and apply `schema.sql` to the configured database.
