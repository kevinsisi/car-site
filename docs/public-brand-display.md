# Public brand display regression — 2026-10-07

## Cause and constraints

Workers do not run `scripts/docker-entrypoint.mjs` and its `applyBrandIcons()` writes. Resolve bundled logos in the public vehicle/brand read model instead of relying on a database mutation at startup. Explicit custom icon URLs stay authoritative. The suffix in `alfa-romeo-106` identifies existing inventory and must not be removed from names or routes; map only its icon asset.

Use truthful initials beside the full brand name for brands without an available asset (currently Mercedes-Maybach), and on image errors. Brand images must not enter the generic 6rem vehicle-image error placeholder. Asset sources are in `public/brand-icons/SOURCES.md`.

Mobile brand links must size to their content. Do not restore a fixed five-column grid or arbitrary character wrapping. Inventory headings must have a full-width mobile row; sort/search/filter controls may reflow and must retain readable labels.

## Evidence

The dedicated EGO TaskSpace reproduced production at 393px: nine quick-brand links had zero image elements; `全部車輛` needed 108px but had a 76px box with hidden overflow, and `選車` wrapped into two lines.

After the fix, an isolated local SQLite fixture exercised the same brands with null icons. EGO verified 320, 375, 390, 393, 430, 768, 1024, and 1440px home/inventory layouts plus 200% root font size at the four requested phone widths. The 320px enlarged sort overflow found in the first pass was fixed and retested. Checks cover the affected brand and inventory controls; they are not a claim that every pre-existing page element supports every accessibility zoom setting.

Eight quick-brand PNGs decoded successfully; Maybach displayed MM with its full name. Deliberately failing a local logo URL showed a 28px initial fallback without the generic image-error class. Actual clicks verified brand filtering, search with brand and sort retained, year sorting, adding two synthetic vehicles, opening the comparison tray, Escape focus return, and navigation to the two-vehicle comparison page.

Focused command: `node --import tsx --test tests/db/vehicles-d1.test.mjs tests/routes/t6c2-cars.test.mjs tests/routes/vehicle-comparison-state.test.mjs` — 16 passing tests. Run the release build with Node 24: `npm run build:workers`. The machine's default Node 26 does not match its installed better-sqlite3 binary; use the existing Node 24 runtime for local SQLite validation.

Evidence PNGs and dimension JSON are retained in the task workspace `/Users/kevin/Documents/Codex/2026-10-07/task-2`. The original Library screenshots were not materialized because this execution environment exposes no Library read/materialize tools; the failure was independently reproduced on the production page.

## Release and recovery

Deploy only through `npm run build:workers` then `npx wrangler deploy --env production`. No schema, DB, media bucket, account, permission, or vehicle mutation is required. The pre-release production Worker version is `75676a53-8fe6-4287-a2a2-b52942841cfd` (source `59c17f675dd90a3f15b717ef2425cd9fac72de8e`). If necessary, recover with `npx wrangler rollback 75676a53-8fe6-4287-a2a2-b52942841cfd --env production` and recheck the public routes.

The existing 32 untracked files, including the original 21 protected entries and both prior OpenSpec changes, were hashed before editing and remain unchanged. Stage only this fix's explicit files.

## Expanded responsive QA

The 852×393 production check found the open main menu's Contact link covered by the fixed comparison tray (`header z-index:20`, tray `z-index:80`; center hit-test reached the comparison link). Raise only the open-menu header to 90, below the existing image dialog layer. Keep the header visible while its menu is open. Normal header and tray positions remain unchanged.
