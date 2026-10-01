# Local public-source sync

The CLI copies a caller-captured public snapshot and locally captured assets to a loopback T14/T15 Worker. It never reads the source database, downloads source media, accesses production, or connects to a remote target. The caller must separately authorize and perform the original public export; no live production feed is configured.

## Setup

Apply the baseline schema first:

```sh
npx wrangler d1 migrations apply DB_PREVIEW --local
```

The optional `migrations/d1-public-source/` migration installs the public-sync tables and revision guard. Do not apply it to the default preview schema unless public-source sync is intentionally enabled. Configure `DB_PREVIEW`, `MEDIA_PREVIEW`, `IMPORT_PREVIEW_TOKEN`, and `MITA_PUBLIC_SYNC_ENABLED=true` for the local Worker using the existing T14/T15 setup. Use a synthetic token for local tests. Supply it in `MITA_LOCAL_IMPORT_TOKEN`, or through `MITA_LOCAL_IMPORT_TOKEN_FILE` pointing to a regular mode-0600 file. The CLI never prints the token.

The snapshot file must be the T14/T15 public projection contract. The asset manifest is a JSON array of rows with exactly these fields:

```json
{
  "source_url": "https://mita.sisihome.org/media/example.jpg",
  "relative_path": "media/example.jpg",
  "roles": ["vehicle-image"],
  "content_type": "image/jpeg",
  "content_length": 3,
  "bytes": 3,
  "sha256": "<64 lowercase hex characters>",
  "file": "media/example.jpg",
  "downloaded_at": "2026-10-01T00:00:00.000Z",
  "status": 200
}
```

Use the caller's local asset download/capture process to create those files. Paths must remain under `--assets-root`, contain no symlink, and match the recorded size, SHA-256 and MIME signature. The total asset limit is 4 GiB and each asset is limited to 40 MiB.

## Run

```sh
MITA_LOCAL_IMPORT_TOKEN='synthetic-local-token' node scripts/sync-public-source.mjs \
  --snapshot /path/to/public-snapshot.json \
  --assets-manifest /path/to/assets-manifest.json \
  --assets-root /path/to/captured-assets \
  --base-url http://127.0.0.1:4321 \
  --journal /tmp/mita-public-sync-journal.json \
  --verify-media
```

`--base-url` accepts only HTTP loopback addresses (`127.0.0.1`, `localhost`, or `::1`). A successful media upload is recorded as its signed receipt in the private journal, atomically, so a later run can HEAD-check and reuse immutable objects. `--verify-media` additionally GETs each reused object and verifies its hash. The full signed receipt is passed unchanged to snapshot import. Snapshot requests use the `{snapshot, media_receipts}` JSON envelope; the Worker reads the observed revision itself.

Uploads use bounded concurrency (6), a per-request timeout, and at most two retries for transient failures. Authentication failures and immutable-key conflicts stop without overwriting or deleting anything. The CLI validates the complete snapshot/media input before making a network request, then validates mapping coverage before the single snapshot POST. Failed uploads, conflicts, or SQL/Worker failures exit nonzero and preserve the journal for resumption. Machine-readable JSON reports uploaded/reused source URLs, whether the snapshot applied, conflicts, and target HTTP status; it never contains the token.

Every later snapshot is an explicit new caller capture and invocation. Updating public content requires a fresh authorized local capture and corresponding snapshot/manifest. This tool does not automate a production export or create a live sync feed.

The managed ownership baseline is limited to 1,000 vehicle IDs, including archived vehicles retained as withdrawal tombstones. Tombstones are not discarded to make room; a snapshot that would exceed the capacity is rejected without changing local ownership or data. Persisted baseline and query JSON binds are also limited to 1.5 MiB.

## Cloudflare production target

The authorized production Worker is `mita` on the custom domain `mita.sisihome.org`. Build and deploy from the repository with:

```sh
npm run build:workers
npx wrangler deploy --env production
```

Before deploying, apply both migration directories to production with Wrangler's remote D1 command:

```sh
npx wrangler d1 migrations apply DB_PREVIEW --remote --env production --directory migrations/d1
npx wrangler d1 migrations apply DB_PREVIEW --remote --env production --directory migrations/d1-public-source
```

Keep an isolated backup of the public database and media objects before the initial public-data import, and document a tested recovery path before replacing that baseline. Store Cloudflare credentials outside Git (for example, in the local Wrangler authentication store or CI secrets); never add credentials to repository files.

Production sync remains an explicit caller-captured snapshot and media feed, not a live source connection. Back up the database and media with isolated Cloudflare resources before initial population and retain a recoverable copy. This configuration does not provide feature parity for unsupported AI, SMTP, or conversion paths; do not describe those paths as production-ready.
