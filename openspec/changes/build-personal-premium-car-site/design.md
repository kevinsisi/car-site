## Context

`_car-maintain/car-site` is a new repository intended for one salesperson's personal premium used-car showcase site. It must not share the `sheet-to-car` database or use `sheet-to-car` as a runtime dependency, but it must accept vehicle data pushed from `sheet-to-car` by API.

The target visitors are affluent middle-aged and older buyers viewing NT$20-30M class vehicles, primarily on iPhone and MacBook devices. The frontend must look refined and expensive, use larger readable typography, respond quickly, and include smooth but restrained transitions.

## Goals / Non-Goals

**Goals:**

- Build a standalone car-site application with its own persistence, admin, public frontend, and import API.
- Optimize the public site for iPhone Safari and MacBook Safari/Chrome before other display targets.
- Support fast switching between curated templates and visual styles from admin settings.
- Keep prices inquiry-only and drive contact through LINE and phone CTAs.
- Use a low-JS frontend approach so the public site remains fast even with rich imagery.
- Include tasteful transitions and image interactions without making the site feel flashy or slow.

**Non-Goals:**

- No marketplace or multi-dealer tenant system in the first version.
- No online checkout, deposits, financing workflow, or member favorites.
- No direct reads from `sheet-to-car` database, SQLite files, or private APIs at runtime.
- No fully freeform website builder; the system provides curated templates and style presets.
- No general low-price used-car listing behavior or public price display.

## Decisions

### Use Astro with Svelte islands for the app foundation

The public site should be mostly server-rendered HTML with minimal client JavaScript. Astro fits the showcase-heavy frontend, while Svelte islands can handle admin interfaces, image carousel interactions, and small dynamic widgets.

Alternatives considered:

- Next.js: strong full-stack option, but heavier by default for a mostly showcase-driven site.
- Express + Alpine: familiar from `sheet-to-car`, but less ideal for a highly polished frontend and componentized theme system.
- Static-only site: fastest, but insufficient for admin, imports, and dynamic publish states.

### Use SQLite with Drizzle and append-only migrations

The site needs an independent database with simple operational needs. SQLite is enough for one salesperson's personal site, and Drizzle gives typed schema and migrations without introducing a heavy ORM.

The database is authoritative for this public site. Imported `sheet-to-car` records are copied into this database and can be edited independently afterward.

### Separate templates from styles

Templates define layout structure; styles define visual language. This allows combinations such as `private-salon + champagne-black` or `executive-showroom + warm-gallery` without duplicating all pages.

Initial templates:

- `private-salon`: concierge/private-club landing with large hero imagery and direct contact flow.
- `heritage-gallery`: gallery-like presentation for rare or collectible vehicles.
- `executive-showroom`: clear, stable, business-oriented listing and details flow.

Initial styles:

- `champagne-black`: black, champagne gold, and warm whites.
- `warm-gallery`: ivory, taupe, deep brown, and low-saturation metallic accents.
- `executive-slate`: slate, ivory, graphite, and restrained contrast.
- `classic-burgundy`: burgundy, black, cream, and classic luxury accents.

### Treat motion as a premium affordance, not decoration

Use CSS transitions, light keyframes, and platform-native View Transitions where appropriate. Avoid heavy animation libraries unless a specific interaction cannot be built cleanly with native capabilities.

Motion should include page/section fade-ins, image crossfades, subtle card hover states, and smooth image browsing. All motion must respect `prefers-reduced-motion`.

### Design for larger readable typography

The UI should not follow young-audience small-font trends. Body text, specs, buttons, and labels need larger defaults with sufficient contrast and tap targets.

Use Apple system fonts first (`system-ui`, `-apple-system`, `BlinkMacSystemFont`, `PingFang TC`) so iPhone and MacBook rendering feels native.

### Make contact configuration global and simple

The site represents one salesperson. Global settings store LINE URL, phone number, display name, template, style, import default behavior, and optional SEO/site metadata. Individual vehicles can override publish state, ordering, cover image, and curated text.

### Import API copies data, never links storage

`sheet-to-car` calls a token-protected API to create or update cars. The API uses `source + externalId` for idempotency, stores a local copy, and applies either request-level `publishMode` or the site's default import mode.

## Risks / Trade-offs

- [Risk] Large vehicle imagery can make the site feel slow on mobile. → Mitigation: require responsive image variants, lazy loading below the fold, prioritized hero/cover images, and fixed layout dimensions to avoid shifts.
- [Risk] Too many theme combinations can dilute visual quality. → Mitigation: ship curated templates/styles only and validate settings against a registry.
- [Risk] Auto-publishing imported cars could expose incomplete or low-quality data. → Mitigation: default to configurable behavior, keep `draft_first` available, and allow per-import override.
- [Risk] Admin features could expand into a full CMS. → Mitigation: constrain admin to vehicles, images, publish states, contact settings, import behavior, and theme selection.
- [Risk] Animations could hurt iPhone Safari performance. → Mitigation: prefer opacity/transform transitions, avoid heavy parallax, and test reduced-motion behavior.
- [Risk] Divergence between imported data and local edits can be confusing. → Mitigation: treat import as upsert into local records and preserve local editorial fields where defined by implementation policy.

## Migration Plan

This is a new repo with no existing product data. Implementation can start by creating the application skeleton, adding migrations, and seeding demo vehicles for visual validation.

Deployment should initially use a development environment with non-production API tokens and sample vehicle data. Rollback is to stop the new service; it does not affect `sheet-to-car` because storage is independent.

## Open Questions

- What production domain will the personal site use?
- Should imported photo URLs be hotlinked initially, or copied into local/object storage during import?
- Should `sold` vehicles remain visible as prestige proof, or be hidden by default?
