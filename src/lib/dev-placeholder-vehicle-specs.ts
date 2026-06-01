// =====================================================================
// DEV-TIME PLACEHOLDER — NOT PRODUCTION DATA
// ---------------------------------------------------------------------
// 此檔保存的是「開發階段為了讓既有 demo 車輛在詳情頁有規格資料可顯示」
// 而暫時手動維護的對照表。並非正式資料來源。
//
// 真正的去向：把 warranty / spec / body / fuel / doorsSeats / cylinders /
// horsepower 升級為 `vehicles` table 的正式欄位（由 Admin 編輯或 Import API
// 寫入），完成後請刪除本檔與 cars/[slug].astro 對它的引用。
//
// 對應 OpenSpec：openspec/changes/refactor-premium-car-showcase/tasks.md
// 第 2 章節「Add structured DB fields ...」(未完成)。
//
// 維護規則：
// - key = vehicle.slug
// - 內容仍維持原始來源語言（未必繁體中文）。前台繁體中文化請改 chrome，
//   不應在此檔做語意翻譯，避免污染「資料」與「介面」邊界。
// =====================================================================

export const devPlaceholderSpecs: Record<string, Record<string, string>> = {
  B181: { warranty: '總代理車源', spec: 'Continental GT V8 Mulliner', body: 'GT Coupe', fuel: '汽油', doorsSeats: '2門 / 4座', cylinders: 'V8', horsepower: '550 hp' },
  B176: { warranty: '總代理車源', spec: 'Phantom Tranquillity', body: 'Luxury Saloon', fuel: '汽油', doorsSeats: '4門 / 5座', cylinders: 'V12', horsepower: '571 hp' },
  B175: { warranty: '性能車況確認', spec: 'Huracan EVO', body: 'Supercar Coupe', fuel: '汽油', doorsSeats: '2門 / 2座', cylinders: 'V10', horsepower: '640 hp' },
  B174: { warranty: '總代理車源', spec: 'Flying Spur V8 S', body: 'Luxury Saloon', fuel: '汽油', doorsSeats: '4門 / 5座', cylinders: 'V8', horsepower: '528 hp' },
  B173: { warranty: '新世代車源', spec: '718 Cayman', body: 'Sports Coupe', fuel: '汽油', doorsSeats: '2門 / 2座', cylinders: '水平對臥4缸', horsepower: '300 hp' },
  B171: { warranty: '新世代旗艦車源', spec: 'Maybach GLS600', body: 'Luxury SUV', fuel: '汽油', doorsSeats: '5門 / 4座', cylinders: 'V8', horsepower: '557 hp' },
  B180: { warranty: '頂級性能車源', spec: 'Purosangue', body: 'Ferrari 4-door GT', fuel: '汽油', doorsSeats: '4門 / 4座', cylinders: 'V12', horsepower: '725 hp' },
};
