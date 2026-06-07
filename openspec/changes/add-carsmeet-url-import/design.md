## Context

The current admin vehicle flow uses `AdminDashboard.svelte` to create and edit vehicles through `/api/admin/vehicles`. The data model already supports imported vehicles through `vehicles.source`, `vehicles.externalId`, and `import_mappings`, and `upsertVehicle` can replace a vehicle image list. Carsmeet vehicle pages are WordPress detail pages with a stable numeric public URL, page title/meta data, a WordPress REST post ID link, visible spec blocks, and media URLs.

## Goals / Non-Goals

**Goals:**
- Let an authorized admin paste a supported carsmeet.tw detail URL and create/update a local draft vehicle in one action.
- Extract practical vehicle data from the page: title, brand, model, year, mileage, exterior/interior colors, description/features when available, and images.
- Prevent duplicate local vehicles for the same carsmeet listing by using `source = "carsmeet"` and the URL numeric ID as `externalId`.
- Keep imported records as drafts so admin users can review before publishing.

**Non-Goals:**
- Generic import from arbitrary websites.
- Bulk crawling of listing/category pages.
- Full-fidelity WordPress/Elementor rendering import.
- Downloading remote images into local media storage during the initial import; imported image URLs may remain remote.

## Decisions

- Add a dedicated admin endpoint, `POST /api/admin/vehicles/import-carsmeet`, instead of overloading `/api/admin/vehicles`.
  - Rationale: URL fetching/parsing has different validation and error behavior from manual vehicle save.
  - Alternative considered: add an `importUrl` mode to `/api/admin/vehicles`; rejected because it mixes external integration concerns into the generic upsert route.

- Parse only `https://carsmeet.tw/<numeric-id>/` URLs and normalize trailing slashes.
  - Rationale: numeric IDs are the stable external IDs users paste and are enough to dedupe imports.
  - Alternative considered: support any WordPress post URL; rejected to keep the first version predictable.
  - Non-standard Carsmeet URLs, including text slugs, are excluded from import parity checks for now.

- Store imported vehicles as `draft` regardless of the source page status.
  - Rationale: imported data needs admin review before public publication, especially for pricing/copy/photo order.
  - Alternative considered: auto-publish imported vehicles; rejected as too risky for one-click external import.

- Use a small local parser module with platform-specific extraction helpers.
  - Rationale: keeps API route thin and makes parser behavior testable without coupling to Svelte UI.
  - Alternative considered: browser automation; rejected due to runtime cost and deployment complexity.

- Preserve idempotency by resolving an existing vehicle by slug first and then by `source = "carsmeet"` plus `externalId = <numeric-id>`.
  - Rationale: `slug` is the cross-source unique public identifier, while source/external ID is an additional import mapping for repeat imports from the same platform.
  - Slug and external ID lookup uses case-insensitive matching for ASCII letters so `B181` and `b181` resolve to the same local vehicle.

## Risks / Trade-offs

- Carsmeet page markup can change -> parser returns a clear error or partial draft instead of publishing bad data.
- Remote images can become unavailable -> admins can still review/import quickly now; local media mirroring can be added later if needed.
- HTML parsing without a full browser may miss lazy-loaded images -> use multiple sources, including post content, `src`, `srcset`, OpenGraph image, and WordPress media URLs.
- External fetches can hang -> API fetch must use a timeout and return a user-facing failure.
