## 1. App Foundation

- [x] 1.1 Initialize the Astro application with TypeScript, Svelte integration, and a Node-compatible runtime target.
- [x] 1.2 Add SQLite and Drizzle with an append-only migration setup.
- [x] 1.3 Add base project scripts for dev, build, typecheck, lint, and formatting.
- [x] 1.4 Create shared app configuration for public site metadata, runtime mode, and database path.

## 2. Data Model

- [x] 2.1 Define database tables for vehicles, vehicle images, site settings, import source mappings, and admin users/sessions.
- [x] 2.2 Add migrations for the initial schema without depending on any `sheet-to-car` database files or tables.
- [x] 2.3 Add seed/demo data for NT$20-30M class premium vehicles suitable for visual validation.
- [x] 2.4 Implement local data access helpers for public vehicle reads and admin vehicle mutations.

## 3. Theme And Template System

- [x] 3.1 Implement a template registry with `private-salon`, `heritage-gallery`, and `executive-showroom` entries.
- [x] 3.2 Implement a style registry with `champagne-black`, `warm-gallery`, `executive-slate`, and `classic-burgundy` entries.
- [x] 3.3 Add CSS token plumbing so selected template/style settings control public page presentation.
- [x] 3.4 Validate unknown template/style values and provide a safe default.

## 4. Premium Public Frontend

- [x] 4.1 Build the public homepage with an iPhone/MacBook-first premium layout and clear LINE/phone CTAs.
- [x] 4.2 Build the public vehicle listing page with large imagery, readable text, inquiry-only pricing, and responsive layout.
- [x] 4.3 Build the public vehicle detail page with image gallery, key specs, large typography, and persistent mobile contact actions.
- [x] 4.4 Add responsive image handling, lazy loading, and layout dimensions to keep image-heavy pages fast.
- [x] 4.5 Add restrained premium transitions for page entry, sections, cards, and gallery interactions.
- [x] 4.6 Add `prefers-reduced-motion` handling for all decorative motion.

## 5. Admin Experience

- [x] 5.1 Implement admin authentication and route/API protection.
- [x] 5.2 Build vehicle management screens for create, edit, publish, unpublish, sold, and archive actions.
- [x] 5.3 Build image management for upload/imported URL handling, cover image selection, and ordering.
- [x] 5.4 Build settings UI for LINE URL, phone number, active template, active style, and default import behavior.
- [x] 5.5 Add admin validation and feedback for publish readiness and settings changes.

## 6. sheet-to-car Import API

- [x] 6.1 Implement token-protected import endpoint for `sheet-to-car` vehicle payloads.
- [x] 6.2 Implement idempotent upsert using `source + externalId` mapping.
- [x] 6.3 Implement `publishMode` handling for `use_default`, `draft`, and `publish`.
- [x] 6.4 Add validation so incomplete imports cannot silently become low-quality public listings.
- [x] 6.5 Document the import request/response contract for future `sheet-to-car` integration work.

## 7. Verification

- [x] 7.1 Run typecheck, lint, and production build commands successfully.
- [x] 7.2 Verify public pages on iPhone-sized and MacBook-sized viewports.
- [x] 7.3 Verify template/style switching changes public presentation without code changes.
- [x] 7.4 Verify import API creates, updates, drafts, and publishes vehicles without reading `sheet-to-car` storage.
- [x] 7.5 Verify reduced-motion mode disables or minimizes decorative motion.
