## ADDED Requirements

### Requirement: Apple-first premium public experience
The public frontend SHALL prioritize iPhone Safari and MacBook Safari/Chrome presentation for affluent middle-aged and older buyers, using a refined luxury visual language rather than a generic used-car marketplace style.

#### Scenario: iPhone visitor opens the homepage
- **WHEN** a visitor opens the public homepage on a current iPhone viewport
- **THEN** the first screen presents a premium vehicle-focused layout with readable text, a clear LINE or phone contact path, and no cramped marketplace-style UI

#### Scenario: MacBook visitor views listings
- **WHEN** a visitor opens the vehicle listing page on a MacBook-sized viewport
- **THEN** the page uses large imagery, generous spacing, and a refined layout suitable for NT$20-30M class vehicles

### Requirement: Larger readable typography
The public frontend SHALL use typography and tap targets larger than typical youth-oriented websites, with body text, specifications, and CTAs readable for middle-aged and older buyers.

#### Scenario: Visitor reads vehicle details on mobile
- **WHEN** a visitor views a vehicle detail page on iPhone
- **THEN** key information such as vehicle name, year, mileage, condition, and contact actions are readable without pinch zooming

#### Scenario: Visitor taps contact action
- **WHEN** a visitor taps LINE or phone contact on mobile
- **THEN** the tap target is large enough for comfortable one-handed use

### Requirement: Inquiry-only pricing and contact CTAs
The public frontend SHALL never display a numeric vehicle sale price and SHALL present inquiry-oriented contact actions through LINE and phone links.

#### Scenario: Vehicle has internal price data
- **WHEN** a published vehicle has price data in the database
- **THEN** the public vehicle card and detail page display inquiry-only wording instead of the numeric price

#### Scenario: Visitor wants to inquire
- **WHEN** a visitor selects a LINE or phone CTA
- **THEN** the site opens the configured LINE URL or phone link for the salesperson

### Requirement: Fast low-JS public pages
The public frontend SHALL keep client-side JavaScript minimal and load public pages quickly, especially on iPhone Safari.

#### Scenario: Public listing loads
- **WHEN** a visitor opens the vehicle listing page
- **THEN** core content renders from server-provided HTML without requiring a large client application bundle

#### Scenario: Page contains many vehicle images
- **WHEN** a page includes multiple vehicle images
- **THEN** non-critical images load lazily and use responsive sizing appropriate to the viewport

### Requirement: Restrained premium motion
The public frontend SHALL include smooth, restrained transitions that enhance perceived quality without harming responsiveness or creating flashy effects.

#### Scenario: Visitor navigates between public pages
- **WHEN** the browser supports smooth page transitions
- **THEN** the site uses subtle fade or slide transitions that feel premium and do not block interaction

#### Scenario: Visitor has reduced motion enabled
- **WHEN** the visitor's system requests reduced motion
- **THEN** decorative transitions are disabled or reduced while content remains fully usable

#### Scenario: Desktop visitor hovers vehicle card
- **WHEN** a MacBook visitor hovers a vehicle card
- **THEN** the card may use subtle transform, image, or shadow changes without jitter or exaggerated movement
