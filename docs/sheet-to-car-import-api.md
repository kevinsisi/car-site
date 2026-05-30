# sheet-to-car Import API

`sheet-to-car` pushes vehicles into this site's independent database. The public site never reads or mounts `sheet-to-car` storage.

```http
POST /api/import/cars
Authorization: Bearer <IMPORT_API_TOKEN>
Content-Type: application/json
```

```json
{
  "source": "sheet-to-car",
  "externalId": "Z8811",
  "brand": "Rolls-Royce",
  "model": "Cullinan",
  "subModel": "Black Badge",
  "year": "2023",
  "mileage": "6800 km",
  "exteriorColor": "Diamond Black",
  "interiorColor": "Mandarin / Black",
  "condition": "總代理｜完整保養紀錄",
  "headline": "私人顧問精選 Black Badge",
  "description": "顧問整理後的車輛描述。",
  "features": ["Starlight Headliner", "Rear Theatre"],
  "photos": ["https://example.com/photo.jpg"],
  "publishMode": "use_default"
}
```

`publishMode` accepts `use_default`, `draft`, or `publish`. Repeated requests with the same `source + externalId` update the existing local vehicle.
