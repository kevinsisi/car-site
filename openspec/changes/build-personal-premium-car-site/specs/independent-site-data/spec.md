## ADDED Requirements

### Requirement: Independent database ownership
The system SHALL use its own database as the authoritative source for all public and admin behavior.

#### Scenario: Public page renders vehicles
- **WHEN** a public page lists or displays vehicles
- **THEN** the data comes from this site's own database, not from `sheet-to-car` storage

#### Scenario: Admin edits imported vehicle
- **WHEN** an admin edits a vehicle that was originally imported from `sheet-to-car`
- **THEN** the edit is saved locally in this site's database

### Requirement: No runtime database sharing with sheet-to-car
The system SHALL NOT directly read, write, mount, or query `sheet-to-car` database files or tables.

#### Scenario: sheet-to-car is unavailable
- **WHEN** `sheet-to-car` is offline after vehicles have already been imported
- **THEN** the public site continues serving imported local vehicles from its own database

#### Scenario: Implementation accesses vehicle data
- **WHEN** application code needs vehicle data at runtime
- **THEN** it uses local application data access paths and not `sheet-to-car` database connections

### Requirement: Local editorial authority
The system SHALL allow locally edited presentation fields to remain under this site's control after import.

#### Scenario: Imported vehicle is edited locally
- **WHEN** an admin customizes a vehicle headline, description, image order, or publish state locally
- **THEN** the local value remains authoritative according to the site's import-update policy
