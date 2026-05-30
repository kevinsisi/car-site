## ADDED Requirements

### Requirement: Admin authentication
The admin area SHALL require authentication before allowing access to vehicle management, settings, or import configuration.

#### Scenario: Unauthenticated user opens admin
- **WHEN** an unauthenticated user requests an admin page or admin API
- **THEN** the system denies access and requires login

### Requirement: Vehicle lifecycle management
The admin area SHALL allow authorized users to create, edit, publish, unpublish, mark sold, and archive vehicles.

#### Scenario: Admin publishes a vehicle
- **WHEN** an admin changes a vehicle status to published
- **THEN** the vehicle becomes visible on public listing and detail pages

#### Scenario: Admin unpublishes a vehicle
- **WHEN** an admin changes a vehicle status to unpublished, draft, or archived
- **THEN** the vehicle is hidden from public listing pages

#### Scenario: Admin marks vehicle sold
- **WHEN** an admin marks a vehicle as sold
- **THEN** the system records the sold state and applies the configured public sold-display behavior

### Requirement: Vehicle image management
The admin area SHALL allow authorized users to manage vehicle images, including cover selection and display ordering.

#### Scenario: Admin sets cover image
- **WHEN** an admin chooses a vehicle cover image
- **THEN** public vehicle cards and detail hero sections use that image as the primary image

#### Scenario: Admin reorders images
- **WHEN** an admin changes vehicle image order
- **THEN** the public detail gallery follows the saved order

### Requirement: Contact and import settings
The admin area SHALL allow authorized users to configure LINE URL, phone number, active template, active style, and default import behavior.

#### Scenario: Admin updates LINE URL
- **WHEN** an admin saves a new LINE URL
- **THEN** public LINE CTAs use the updated URL

#### Scenario: Admin changes default import behavior
- **WHEN** an admin selects draft-first or auto-publish as the default import behavior
- **THEN** subsequent imports using default behavior follow the saved setting
