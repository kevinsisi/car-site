import { eq } from 'drizzle-orm';
import { db } from './connection';
import { adminUsers, siteSettings, vehicleImages, vehicles } from './schema';
import { appConfig } from '@/lib/config';
import { hashPassword } from '@/lib/crypto';

const now = new Date().toISOString();

async function seedSettings() {
  const defaults = {
    salespersonName: 'Kevin 私人車庫顧問',
    lineUrl: 'https://line.me/R/ti/p/@premium-car',
    phoneNumber: '+886900000000',
    activeTemplate: 'private-salon',
    activeStyle: 'carsmeet-blue',
    importBehavior: 'draft_first',
    showSoldVehicles: 'false',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(siteSettings).values({ key, value, updatedAt: now }).onConflictDoNothing();
  }
}

async function seedAdmin() {
  const existing = await db.select().from(adminUsers).where(eq(adminUsers.username, appConfig.adminUsername)).limit(1);
  if (existing.length) return;
  await db.insert(adminUsers).values({
    id: crypto.randomUUID(),
    username: appConfig.adminUsername,
    passwordHash: hashPassword(appConfig.adminPassword),
    createdAt: now,
  });
}

async function seedVehicles() {
  const existing = await db.select().from(vehicles).limit(1);
  if (existing.length) return;

  const demoVehicles = [
    {
      id: crypto.randomUUID(),
      slug: 'rolls-royce-cullinan-black-badge-2023',
      title: '2023 Rolls-Royce Cullinan Black Badge',
      brand: 'Rolls-Royce',
      model: 'Cullinan',
      subModel: 'Black Badge',
      year: '2023',
      mileage: '6,800 km',
      exteriorColor: 'Diamond Black',
      interiorColor: 'Mandarin / Black',
      condition: '總代理｜低里程｜完整保養紀錄',
      status: 'published',
      headline: '為重視安靜與氣場的買家準備的私人座駕',
      description: '這部 Cullinan Black Badge 保留勞斯萊斯的從容，同時多了更內斂的性能姿態。適合需要正式接待、家庭移動與私密空間兼具的買家。',
      featuresJson: JSON.stringify(['Black Badge 套件', 'Starlight Headliner', '後座劇院式配置', '完整原廠保養']),
      monthlyRecommended: false,
      source: 'manual',
      localEditsJson: JSON.stringify(['headline', 'description']),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      slug: 'bentley-continental-gt-speed-2022',
      title: '2022 Bentley Continental GT Speed',
      brand: 'Bentley',
      model: 'Continental GT',
      subModel: 'Speed',
      year: '2022',
      mileage: '9,200 km',
      exteriorColor: 'Onyx Black',
      interiorColor: 'Linen / Beluga',
      condition: '稀有 Speed 規格｜車況精緻',
      status: 'published',
      headline: '紳士感與速度感並存的雙門旅行車',
      description: 'Continental GT Speed 是很少數能同時照顧駕駛樂趣、長途舒適與車主品味的高級 GT。適合不想高調，但希望每次開車都有儀式感的買家。',
      featuresJson: JSON.stringify(['W12 Speed', 'Mulliner Driving Specification', 'Naim Audio', 'Touring Specification']),
      monthlyRecommended: false,
      source: 'manual',
      localEditsJson: JSON.stringify(['headline', 'description']),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      slug: 'ferrari-roma-2021',
      title: '2021 Ferrari Roma',
      brand: 'Ferrari',
      model: 'Roma',
      subModel: '',
      year: '2021',
      mileage: '12,000 km',
      exteriorColor: 'Blu Roma',
      interiorColor: 'Tortora',
      condition: '優雅配色｜完整檢查',
      status: 'published',
      headline: '不需張揚，也能讓人一眼記住的法拉利',
      description: 'Roma 的線條更像一件高級西裝，保留 Ferrari 的品牌張力，卻不過度侵略。適合重視品味與日常可用性的收藏者。',
      featuresJson: JSON.stringify(['Blu Roma 稀有外觀', 'Daytona 座椅', 'Carbon LED 方向盤', '原廠保養紀錄']),
      monthlyRecommended: false,
      source: 'manual',
      localEditsJson: JSON.stringify(['headline', 'description']),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const imageSets = [
    [
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1800&q=85',
      'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1800&q=85',
    ],
    [
      'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1800&q=85',
      'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1800&q=85',
    ],
    [
      'https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=1800&q=85',
      'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1800&q=85',
    ],
  ];

  for (const [index, vehicle] of demoVehicles.entries()) {
    await db.insert(vehicles).values(vehicle);
    for (const [sortOrder, url] of imageSets[index].entries()) {
      await db.insert(vehicleImages).values({
        id: crypto.randomUUID(),
        vehicleId: vehicle.id,
        url,
        alt: vehicle.title,
        sortOrder,
        isCover: sortOrder === 0,
        createdAt: now,
      });
    }
  }
}

await seedSettings();
await seedAdmin();
await seedVehicles();
console.log('Seed complete');
