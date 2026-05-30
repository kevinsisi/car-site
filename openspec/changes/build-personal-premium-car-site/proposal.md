## Why

Build a dedicated personal showcase site for a premium-car salesperson whose clients are affluent middle-aged and older buyers using mostly iPhones and MacBooks. The site needs to feel trustworthy, refined, fast, and clearly separate from `sheet-to-car`, while still accepting vehicle imports from it through an API.

## What Changes

- Create a standalone premium used-car showcase application with its own database and administration surface.
- Add a high-end responsive frontend optimized first for iPhone and MacBook displays, with larger typography, clear CTAs, and fast page loads.
- Add a template and style system so the operator can quickly switch presentation layouts and visual languages without code changes.
- Add restrained, fluid transitions that feel premium and support reduced-motion preferences.
- Add vehicle listing and detail experiences where prices are always inquiry-only and contact is driven by LINE and phone actions.
- Add an admin workflow for managing cars, images, publish state, contact settings, and import behavior.
- Add an authenticated API for `sheet-to-car` to push vehicle data into this site's independent database without sharing runtime data stores.

## Capabilities

### New Capabilities

- `premium-showcase-frontend`: Public iPhone/MacBook-first premium vehicle pages, typography, CTAs, responsive behavior, and motion requirements.
- `theme-template-system`: Template and style selection, theme registry behavior, and admin-controlled visual switching.
- `vehicle-management-admin`: Admin authentication, vehicle CRUD, image management, publish states, contact settings, and import-mode settings.
- `sheet-to-car-import-api`: Authenticated API contract for importing/updating vehicles from `sheet-to-car` into the independent site database.
- `independent-site-data`: Standalone persistence rules, schema ownership, and prohibition on sharing or directly reading `sheet-to-car` storage.

### Modified Capabilities

- None.

## Impact

- New application code under `_car-maintain/car-site`.
- New frontend stack focused on static/low-JS performance with selective interactive islands.
- New independent SQLite database and migration process for the personal site.
- New admin APIs for vehicle and settings management.
- New import API consumed by `_car-maintain/sheet-to-car`, without coupling to its database.
- New design constraints for premium visual quality, larger readable typography, Apple-device-first testing, and restrained animation.
