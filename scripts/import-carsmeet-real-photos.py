import json
import shutil
import sqlite3
import urllib.parse
import urllib.request
from pathlib import Path

ITEMS = ['B181', 'B176', 'B175', 'B174', 'B173', 'B171', 'B180']
SOURCE_DB = '/srv/data4tb/carsmeet/data/sheet-to-car-prod.db'
SOURCE_PHOTOS = Path('/srv/data4tb/carsmeet/data/photos')
TARGET_DB = '/srv/data4tb/car-site-mita/data/car-site.db'
TARGET_MEDIA = Path('/srv/data4tb/car-site-mita/data/media/inventory')
TOKEN_FILE = Path('/home/kevin/DockerCompose/car-site-mita/.import-token')
IMPORT_URL = 'http://127.0.0.1:5325/api/import/cars'


def row_value(row, key):
    value = row[key]
    return '' if value is None else str(value).strip()


def main():
    token = TOKEN_FILE.read_text().strip()
    source = sqlite3.connect(SOURCE_DB)
    source.row_factory = sqlite3.Row

    target = sqlite3.connect(TARGET_DB)
    target.execute("DELETE FROM vehicles WHERE source='manual'")
    target.commit()
    target.close()

    imported = []
    for item in ITEMS:
        car = source.execute('SELECT * FROM cars WHERE item = ?', (item,)).fetchone()
        if not car:
            continue

        all_photos = source.execute(
            "SELECT * FROM car_photos WHERE item = ? AND category = 'actual' ORDER BY sort_order ASC, id ASC",
            (item,),
        ).fetchall()
        # sheet-to-car actual photo sets often begin with registration documents.
        # Prefer later showroom/car photos as covers while keeping enough gallery depth.
        start = 6 if len(all_photos) > 10 else 0
        photos = all_photos[start : start + 8]

        urls = []
        item_dir = TARGET_MEDIA / item
        item_dir.mkdir(parents=True, exist_ok=True)
        for photo in photos:
            src = SOURCE_PHOTOS / item / 'actual' / row_value(photo, 'filename')
            if not src.exists():
                continue
            safe_name = f"{photo['id']}_{row_value(photo, 'filename')}"
            dst = item_dir / safe_name
            shutil.copy2(src, dst)
            urls.append('/media/' + urllib.parse.quote(f'inventory/{item}/{safe_name}'))

        if not urls:
            continue

        title = ' '.join(
            part for part in [row_value(car, 'year'), row_value(car, 'brand'), row_value(car, 'model'), row_value(car, 'sub_model')] if part
        )
        payload = {
            'source': 'carsmeet-sheet-to-car',
            'externalId': item,
            'title': title,
            'brand': row_value(car, 'brand'),
            'model': row_value(car, 'model'),
            'subModel': row_value(car, 'sub_model'),
            'year': row_value(car, 'year'),
            'mileage': row_value(car, 'mileage'),
            'exteriorColor': row_value(car, 'exterior_color'),
            'interiorColor': row_value(car, 'interior_color'),
            'condition': row_value(car, 'condition') or '實拍現車｜詳細車況請洽詢',
            'headline': f"{row_value(car, 'brand')} {row_value(car, 'model')} 實拍現車，專人介紹車況與配備",
            'description': row_value(car, 'note') or '此車已整理實拍照片，詳細來源、車況、保養與配備請直接 LINE 或電話洽詢。',
            'features': [
                value
                for value in ['實拍照片', row_value(car, 'status'), row_value(car, 'exterior_color'), row_value(car, 'interior_color'), row_value(car, 'modification')]
                if value
            ],
            'photos': urls,
            'publishMode': 'publish',
        }
        req = urllib.request.Request(
            IMPORT_URL,
            data=json.dumps(payload).encode('utf-8'),
            headers={'content-type': 'application/json', 'authorization': 'Bearer ' + token},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode('utf-8'))
        imported.append({'item': item, 'title': title, 'photos': len(urls), 'status': result.get('status')})

    print(json.dumps({'imported': imported}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
