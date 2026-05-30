## ADDED Requirements

### Requirement: Curated template selection
The system SHALL provide a registry of curated public-page templates that can be selected from admin settings without code changes.

#### Scenario: Admin changes template
- **WHEN** an admin selects a different valid template and saves settings
- **THEN** public pages render with the selected layout structure

#### Scenario: Invalid template is requested
- **WHEN** settings or an API request references an unknown template
- **THEN** the system rejects the value or falls back to a safe default without breaking public pages

### Requirement: Curated style selection
The system SHALL provide a registry of curated visual styles that can be selected independently from templates.

#### Scenario: Admin changes style
- **WHEN** an admin selects a different valid style and saves settings
- **THEN** public pages update colors, typography accents, spacing tokens, and component treatments according to that style

#### Scenario: Template and style are combined
- **WHEN** a valid template and valid style are both configured
- **THEN** the public site renders the template structure using the selected style tokens

### Requirement: Theme quality constraints
The theme system SHALL constrain switching to curated premium combinations and SHALL NOT expose a freeform page builder in the first version.

#### Scenario: Admin configures appearance
- **WHEN** an admin opens appearance settings
- **THEN** the admin can choose from predefined templates and styles rather than editing arbitrary layout blocks

#### Scenario: Public site renders any supported combination
- **WHEN** the public site renders a supported template/style combination
- **THEN** the result maintains premium spacing, readable typography, and LINE/phone contact visibility
