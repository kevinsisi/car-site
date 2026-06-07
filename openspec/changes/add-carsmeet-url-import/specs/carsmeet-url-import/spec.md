## ADDED Requirements

### Requirement: Admin can import a supported Carsmeet URL
The system SHALL allow an authorized vehicle editor to import a vehicle by submitting a carsmeet.tw vehicle detail URL with a numeric path ID.

#### Scenario: Supported URL is imported
- **WHEN** an authorized admin submits `https://carsmeet.tw/265/`
- **THEN** the system creates or updates a local vehicle with `source` set to `carsmeet` and `externalId` set to `265`

#### Scenario: Unsupported URL is rejected
- **WHEN** an authorized admin submits a URL that is not a carsmeet.tw numeric detail URL
- **THEN** the system rejects the request with a clear validation error and does not create a vehicle

### Requirement: Imported vehicle remains reviewable before publication
The system SHALL import Carsmeet vehicles as local drafts so admins can review and edit the data before public publication.

#### Scenario: Imported vehicle is draft
- **WHEN** a Carsmeet URL import succeeds
- **THEN** the resulting local vehicle status is `draft`

### Requirement: Import extracts practical vehicle data
The system SHALL populate local vehicle fields from the Carsmeet page when the page provides them, including title, brand, model, year, mileage, exterior color, interior color, description, features, and images.

#### Scenario: Source page has vehicle specs and images
- **WHEN** the Carsmeet page includes title, specs, colors, and media URLs
- **THEN** the local vehicle draft contains the extracted fields and at least the available cover image

### Requirement: Re-import is idempotent
The system SHALL update the existing local Carsmeet-sourced vehicle for the same external ID instead of creating duplicates.

#### Scenario: Same URL is imported twice
- **WHEN** an admin imports the same supported Carsmeet URL more than once
- **THEN** the system updates the existing local vehicle and returns that vehicle ID

### Requirement: Import failures are visible to admins
The system SHALL report fetch, parse, and validation failures to the admin without silently creating incomplete vehicles.

#### Scenario: Source page cannot be fetched
- **WHEN** the Carsmeet page request fails or times out
- **THEN** the admin receives an error message and no new vehicle is created
