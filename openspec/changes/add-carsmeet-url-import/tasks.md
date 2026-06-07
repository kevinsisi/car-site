## 1. Parser And Import API

- [x] 1.1 Create a Carsmeet URL parser module that validates supported URLs and extracts the numeric external ID.
- [x] 1.2 Implement page fetching with timeout and clear failure messages.
- [x] 1.3 Extract vehicle fields and image URLs from Carsmeet page HTML/meta content.
- [x] 1.4 Add an authenticated admin import endpoint that creates or updates a draft vehicle with `source = "carsmeet"` and the extracted external ID.

## 2. Admin UI

- [x] 2.1 Add a URL import control to the admin vehicles page.
- [x] 2.2 Show import progress, success, and error feedback in the existing admin notification style.
- [x] 2.3 Refresh or focus the imported vehicle after a successful import.

## 3. Verification

- [x] 3.1 Verify unsupported URLs are rejected without creating vehicles.
- [x] 3.2 Verify `https://carsmeet.tw/265/` imports a draft vehicle with fields and images.
- [x] 3.3 Run the project build checks.
