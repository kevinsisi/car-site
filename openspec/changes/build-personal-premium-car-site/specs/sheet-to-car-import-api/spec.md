## ADDED Requirements

### Requirement: Authenticated vehicle import
The system SHALL expose an authenticated API that allows `sheet-to-car` to create or update vehicle records in this site's independent database.

#### Scenario: Valid import request
- **WHEN** `sheet-to-car` sends a valid authenticated vehicle import request
- **THEN** the system stores or updates a local vehicle record and returns the local vehicle identifier and resulting status

#### Scenario: Missing or invalid token
- **WHEN** an import request lacks a valid API token
- **THEN** the system rejects the request without creating or updating a vehicle

### Requirement: Idempotent source mapping
The import API SHALL use source identity and external vehicle ID to avoid duplicate vehicles for repeated imports.

#### Scenario: Same external vehicle is imported twice
- **WHEN** two valid import requests use the same source and external ID
- **THEN** the second request updates the existing local vehicle instead of creating a duplicate

### Requirement: Configurable publish mode
The import API SHALL support per-request publish mode while respecting the site's default import behavior when requested.

#### Scenario: Import uses default behavior
- **WHEN** an import request sets publish mode to use default
- **THEN** the resulting vehicle status follows the admin-configured default import behavior

#### Scenario: Import forces draft
- **WHEN** an import request sets publish mode to draft
- **THEN** the resulting vehicle is not publicly visible after import

#### Scenario: Import forces publish
- **WHEN** an import request sets publish mode to publish
- **THEN** the resulting vehicle is publicly visible after import if required public fields are valid

### Requirement: Public-quality validation
The import API SHALL validate enough vehicle data to avoid publishing incomplete or low-quality public listings.

#### Scenario: Auto-publish request lacks required public fields
- **WHEN** an import request attempts to publish a vehicle without required public fields such as title or primary image
- **THEN** the system stores the vehicle as draft or rejects publish status with a clear validation response
