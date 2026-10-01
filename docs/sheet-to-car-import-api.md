# sheet-to-car Import API

`sheet-to-car` pushes vehicles into this site's independent database. The public site never reads or mounts `sheet-to-car` storage.

The Worker import endpoint accepts exactly these `source` values: `preview`, `sheet-to-car`, and `carsmeet-sheet-to-car`. `preview` imports must use a `DEMO-`-prefixed `externalId`; the two established importer namespaces may use their original non-demo external IDs. This permits explicit imports into the site's independent database; it does not migrate canonical source data or provide automatic synchronization.

Worker requests require `Authorization: Bearer <IMPORT_PREVIEW_TOKEN>` and the preview D1 binding. Worker photos must resolve to the same origin as the request; external photo URLs are rejected. The non-Worker Node import path continues to use `IMPORT_API_TOKEN` and its existing arbitrary-source contract.

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
  "sourceStatus": "在庫",
  "publishMode": "use_default"
}
```

`publishMode` accepts `use_default`, `draft`, or `publish`. Repeated requests with the same `source + externalId` update the existing local vehicle.

## Source Status Mapping

When `sourceStatus` is provided, the import maps source inventory statuses into the local vehicle status model:

| Source status | Local status |
|---|---|
| `在庫` | `published` |
| `未到港` | `incoming` |
| `收訂` | `reserved` |
| `特殊` | `special` |
| `售出` | `sold` |
| `#N/A`, unknown values | `unknown` |

Sold imports stay available through `/cars?tab=sold` (`成交實錄`) only when public sold vehicles are enabled in admin. They do not appear in brand inventory filters, `全部`, `本月精選`, public detail pages, or homepage `成交案例` while that setting is disabled. Homepage `成交案例` also requires explicit admin curation with `顯示於成交案例`.
