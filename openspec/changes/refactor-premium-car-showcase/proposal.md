## Why

The site needs to evolve from a working vehicle showcase into an Apple-like premium car advisory experience: minimal visual chrome, enough vehicle detail for serious buyers, and low-friction sharing for sales workflows.

## What Changes

- Refactor public UI toward clean spacing, subtle controls, icon-led metadata, and compact footer/contact surfaces.
- Add share actions for each vehicle card and detail page using native Web Share with copy-link fallback.
- Replace textual social links with small icon-only platform links.
- Add dedicated About and Contact pages for trust, address, phone, LINE, hours, and service promises.
- Expand detail-page information architecture toward premium automotive specs while preserving truthful placeholders where structured data is not yet available.

## Impact

- Frontend pages, shared layout, vehicle cards, detail pages, and global styles.
- No public exposure change; `mita.sisihome.org` remains private/Tailscale routed.
- Future phase should add DB fields for warranty, spec origin, body type, fuel, transmission, cylinders, horsepower, doors/seats, and availability.
