export const detailSpecFieldOptions = [
  { key: 'year', label: '年份' },
  { key: 'mileage', label: '里程' },
  { key: 'warranty', label: '保固' },
  { key: 'spec', label: '規格' },
  { key: 'body', label: '車型' },
  { key: 'fuel', label: '燃料' },
  { key: 'exteriorColor', label: '外觀顏色' },
  { key: 'interiorColor', label: '內裝顏色' },
  { key: 'doorsSeats', label: '車門 / 座位' },
  { key: 'cylinders', label: '缸數' },
  { key: 'horsepower', label: '馬力' },
  { key: 'price', label: '價格' },
] as const;

export const defaultDetailSpecFields = detailSpecFieldOptions.map((field) => field.key);
