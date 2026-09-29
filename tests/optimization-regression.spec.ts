import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const databasePath =
  process.env.DATABASE_PATH ||
  path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "car-site-focused-")),
    "car-site.db",
  );
process.env.DATABASE_PATH = databasePath;
const fixtureRoot = path.dirname(databasePath);
const mediaRoot = path.join(fixtureRoot, "media");
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
fs.mkdirSync(path.join(mediaRoot, "__optimized", "fixtures"), {
  recursive: true,
});
fs.writeFileSync(
  path.join(mediaRoot, "__optimized", "fixtures", "full.webp"),
  onePixelPng,
);
fs.writeFileSync(
  path.join(mediaRoot, "__optimized", "fixtures", "full-thumb.webp"),
  onePixelPng,
);
fs.writeFileSync(
  path.join(mediaRoot, "__optimized", "fixtures", "full-only.webp"),
  onePixelPng,
);

type LoadedModules = Awaited<ReturnType<typeof loadModulesOnce>>;
let modulesPromise: Promise<LoadedModules> | undefined;

async function loadModules(): Promise<LoadedModules> {
  if (modulesPromise) return modulesPromise;
  modulesPromise = loadModulesOnce();
  return modulesPromise;
}

async function loadModulesOnce() {
  const { sqlite } = await import("../src/db/connection");
  await import("../src/db/migrate");
  const media = await import("../src/lib/media");
  const vehicles = await import("../src/lib/vehicles");
  return { media, sqlite, vehicles };
}

async function waitForManifest(media: typeof import("../src/lib/media")) {
  const originalExistsSync = fs.existsSync;
  fs.existsSync = (() => false) as typeof fs.existsSync;
  try {
    await expect
      .poll(() => media.optimizedMediaUrl("/media/fixtures/full.jpg"))
      .toBe("/media/__optimized/fixtures/full.webp");
  } finally {
    fs.existsSync = originalExistsSync;
  }
}

test.describe("optimization regression coverage", () => {
  test.beforeAll(async () => {
    await import("../src/db/connection");
    await import("../src/db/migrate");
  });

  test.afterAll(async () => {
    const { sqlite } = await loadModules();
    sqlite.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("uses filesystem fallback while the optimized manifest is not ready", async () => {
    const originalReaddir = fs.promises.readdir;
    const readDir = originalReaddir as (...args: any[]) => Promise<unknown>;
    let releaseManifest!: () => void;
    let firstRead = true;
    fs.promises.readdir = (async (directory, options) => {
      if (!firstRead) return readDir(directory, options) as never;
      firstRead = false;
      return new Promise<unknown>((resolve, reject) => {
        releaseManifest = () =>
          readDir(directory, options).then(resolve, reject);
      });
    }) as typeof fs.promises.readdir;

    const media = await import("../src/lib/media");
    const optimizedPath = path.join(
      mediaRoot,
      "__optimized",
      "uploads",
      "fallback.webp",
    );
    fs.mkdirSync(path.dirname(optimizedPath), { recursive: true });
    fs.writeFileSync(optimizedPath, onePixelPng);
    expect(media.optimizedMediaUrl("/media/uploads/fallback.jpg")).toBe(
      "/media/__optimized/uploads/fallback.webp",
    );

    releaseManifest();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.promises.readdir = originalReaddir;
  });

  test("does not call existsSync after the manifest is ready", async () => {
    const { media } = await loadModules();
    await waitForManifest(media);
    const originalExistsSync = fs.existsSync;
    fs.existsSync = (() => {
      throw new Error("existsSync must not be used after manifest readiness");
    }) as typeof fs.existsSync;
    try {
      expect(media.resolveMediaPair("/media/fixtures/full.jpg")).toEqual({
        url: "/media/__optimized/fixtures/full.webp",
        thumbUrl: "/media/__optimized/fixtures/full-thumb.webp",
      });
    } finally {
      fs.existsSync = originalExistsSync;
    }
  });

  test("registers both optimized upload variants for later resolution", async () => {
    const { media } = await loadModules();
    await waitForManifest(media);
    media.registerOptimizedMedia("/media/uploads/registered/photo.jpg");
    expect(
      media.resolveMediaPair("/media/uploads/registered/photo.jpg"),
    ).toEqual({
      url: "/media/__optimized/uploads/registered/photo.webp",
      thumbUrl: "/media/__optimized/uploads/registered/photo-thumb.webp",
    });
  });

  test("falls back independently and keeps repeated registrations deduplicated", async () => {
    const { media } = await loadModules();
    await waitForManifest(media);
    expect(media.resolveMediaPair("/media/fixtures/full-only.jpg")).toEqual({
      url: "/media/__optimized/fixtures/full-only.webp",
      thumbUrl: "/media/__optimized/fixtures/full-only.webp",
    });
    media.registerOptimizedMedia("/media/uploads/dedup/photo.jpg");
    media.registerOptimizedMedia("/media/uploads/dedup/photo.jpg");
    expect(media.resolveMediaPair("/media/uploads/dedup/photo.jpg")).toEqual({
      url: "/media/__optimized/uploads/dedup/photo.webp",
      thumbUrl: "/media/__optimized/uploads/dedup/photo-thumb.webp",
    });
  });

  test("upload optimization registers the generated full/thumb pair", async () => {
    const { media, sqlite } = await loadModules();
    const { hashPassword } = await import("../src/lib/crypto");
    const { createSession } = await import("../src/lib/auth");
    const { POST } = await import("../src/pages/api/admin/media");
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO admin_users (id, username, password_hash, role, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "test-admin",
        "test-admin",
        hashPassword("test-password"),
        "admin",
        0,
        new Date().toISOString(),
      );
    const session = await createSession("test-admin", "test-password");
    expect(session).not.toBeNull();
    const formData = new FormData();
    formData.append(
      "files",
      new File([onePixelPng], "upload.png", { type: "image/png" }),
    );
    const response = await POST({
      request: new Request("http://localhost/api/admin/media", {
        method: "POST",
        body: formData,
      }),
      cookies: { get: () => ({ value: session!.cookieValue }) } as never,
    } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(200);
    const { urls } = (await response.json()) as { urls: string[] };
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(media.resolveMediaPair(urls[0])).toEqual({
      url: urls[0]
        .replace("/media/", "/media/__optimized/")
        .replace(/\.[^.]+$/, ".webp"),
      thumbUrl: urls[0]
        .replace("/media/", "/media/__optimized/")
        .replace(/\.[^.]+$/, "-thumb.webp"),
    });
  });

  test("listPublicBrands does not load vehicle images", async () => {
    const { sqlite, vehicles } = await loadModules();
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO vehicles (id, slug, title, brand, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "brand-test",
        "brand-test",
        "Brand Test",
        "Test Brand",
        "Model",
        "published",
        new Date().toISOString(),
        new Date().toISOString(),
      );
    const queries: string[] = [];
    sqlite.prepare("SELECT 1");
    const originalPrepare = sqlite.prepare.bind(sqlite);
    sqlite.prepare = ((sql: string) => {
      queries.push(sql);
      return originalPrepare(sql);
    }) as typeof sqlite.prepare;
    try {
      await expect(vehicles.listPublicBrands()).resolves.toEqual([
        {
          displayName: "Test Brand",
          urlSlug: "test-brand",
          count: 1,
          iconUrl: null,
        },
      ]);
      expect(queries.some((query) => query.includes("vehicle_images"))).toBe(
        false,
      );
    } finally {
      sqlite.prepare = originalPrepare;
    }
  });
});
