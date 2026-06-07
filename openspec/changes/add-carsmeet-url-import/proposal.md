## Why

Admin users currently need to manually recreate vehicle listings when a vehicle already exists on carsmeet.tw. A one-click URL import reduces repeated data entry and makes it faster to stage vehicles in the premium car-site backend.

## What Changes

- Add an admin-only carsmeet.tw URL import flow for vehicle detail URLs such as `https://carsmeet.tw/265/`.
- Parse the source page into the existing vehicle fields and image list, then create or update a local vehicle as a draft by default.
- Track imported vehicles with `source = "carsmeet"` and the numeric source page ID as `externalId` to avoid duplicate imports.
- Surface parse/import errors clearly in the admin UI without publishing incomplete data.

## Capabilities

### New Capabilities
- `carsmeet-url-import`: Admin users can import a vehicle listing from a supported carsmeet.tw URL into the local vehicle catalog.

### Modified Capabilities

## Impact

- Adds an admin API endpoint for carsmeet URL import.
- Adds parsing logic for carsmeet vehicle pages.
- Updates the vehicle admin UI with a URL import control and import feedback.
- Uses the existing vehicle, image, source, and external ID storage model.
