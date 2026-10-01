import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createD1Db } from "../../src/db/d1.ts";
import { signSession } from "../../src/lib/crypto.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/db/connection") {
      return {
        url: "data:text/javascript,export%20const%20db%20%3D%20%7B%7D",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

function makeD1(seed = []) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE vehicles (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      card_title_supplement TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, model TEXT NOT NULL,
      sub_model TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', mileage TEXT NOT NULL DEFAULT '',
      exterior_color TEXT NOT NULL DEFAULT '', interior_color TEXT NOT NULL DEFAULT '',
      condition TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', headline TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '', features_json TEXT NOT NULL DEFAULT '[]',
      monthly_recommended INTEGER NOT NULL DEFAULT 0, show_sold_case INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual', external_id TEXT, local_edits_json TEXT NOT NULL DEFAULT '[]',
      sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, permissions INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX vehicles_source_external_idx ON vehicles(source, external_id);
    CREATE TABLE vehicle_images (
      id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), url TEXT NOT NULL,
      alt TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      is_cover INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE import_mappings (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id), last_imported_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX import_mappings_source_external_idx ON import_mappings(source, external_id);
  `);
  for (const row of seed) {
    sqlite
      .prepare(
        `INSERT INTO vehicles (
      id, slug, title, brand, model, source, external_id, local_edits_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.slug,
        row.title,
        row.brand,
        row.model,
        row.source,
        row.external_id,
        row.local_edits_json,
        row.created_at,
        row.updated_at,
      );
  }
  sqlite.exec(`
    INSERT INTO admin_users VALUES ('DEMO-admin', 'DEMO-admin', 'unused', 'admin', 2, 'DEMO-created');
    INSERT INTO admin_sessions VALUES ('DEMO-session', 'DEMO-admin', '2999-01-01T00:00:00.000Z', 'DEMO-created');
  `);
  const binding = {
    prepare(query) {
      let values = [];
      return {
        query,
        bind(...args) {
          values = args;
          return this;
        },
        values: () => values,
        async all() {
          return { results: sqlite.prepare(query).all(...values) };
        },
        async raw() {
          return sqlite
            .prepare(query)
            .all(...values)
            .map((row) => Object.values(row));
        },
        async run() {
          const result = sqlite.prepare(query).run(...values);
          return { success: true, meta: { changes: result.changes } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(({ query, values }) =>
          sqlite.prepare(query).run(...values()),
        );
        sqlite.exec("COMMIT");
        return results.map((result) => ({
          success: true,
          meta: { changes: result.changes },
        }));
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return {
    binding,
    db: createD1Db(binding),
    getVehicle(id) {
      return sqlite.prepare("SELECT * FROM vehicles WHERE id = ?").get(id);
    },
    getVehicles() {
      return sqlite.prepare("SELECT * FROM vehicles ORDER BY id").all();
    },
    getMappings() {
      return sqlite
        .prepare("SELECT * FROM import_mappings ORDER BY id")
        .all()
        .map((row) => ({ ...row }));
    },
    getVehicleCopy(id) {
      return {
        ...sqlite.prepare("SELECT * FROM vehicles WHERE id = ?").get(id),
      };
    },
    getVehiclesCopy() {
      return sqlite
        .prepare("SELECT * FROM vehicles ORDER BY id")
        .all()
        .map((row) => ({ ...row }));
    },
    addMapping(row) {
      sqlite
        .prepare(
          "INSERT INTO import_mappings (id, source, external_id, vehicle_id, last_imported_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          row.id,
          row.source,
          row.externalId,
          row.vehicleId,
          row.lastImportedAt,
        );
    },
    close() {
      sqlite.close();
    },
  };
}

const repo = await import("../../src/lib/vehicles.ts");
const vehicleRoute = await import("../../src/pages/api/admin/vehicles.ts");

const secret = "DEMO-worker-session-secret";
const token = signSession("DEMO-session", secret);
const context = (body) => ({
  request: new Request("https://preview.example/api/admin/vehicles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
  cookies: {
    get: (name) => (name === "car_site_admin" ? { value: token } : undefined),
  },
  locals: {
    runtime: {
      env: {
        DB_PREVIEW: globalThis.__sourcePreservationBinding,
        SESSION_SECRET: secret,
      },
    },
  },
});

test("ordinary admin-shaped edit preserves imported identity, local edits, and unrelated data", async () => {
  const importedEdits = '[{"field":"headline","value":"locally curated"}]';
  const fixture = makeD1([
    {
      id: "DEMO-imported-A",
      slug: "imported-a",
      title: "Before edit",
      brand: "DEMO-brand",
      model: "DEMO-model",
      source: "DEMO-feed",
      external_id: "DEMO-external-A",
      local_edits_json: importedEdits,
      created_at: "DEMO-created-A",
      updated_at: "DEMO-updated-A",
    },
    {
      id: "DEMO-unrelated-B",
      slug: "unrelated-b",
      title: "Untouched B",
      brand: "DEMO-brand-B",
      model: "DEMO-model-B",
      source: "DEMO-feed-B",
      external_id: "DEMO-external-B",
      local_edits_json: "[]",
      created_at: "DEMO-created-B",
      updated_at: "DEMO-updated-B",
    },
  ]);
  try {
    const mapping = {
      id: "DEMO-mapping-A",
      source: "DEMO-feed",
      externalId: "DEMO-external-A",
      vehicleId: "DEMO-imported-A",
      lastImportedAt: "DEMO-imported-at",
    };
    fixture.addMapping(mapping);
    const beforeB = fixture.getVehicleCopy("DEMO-unrelated-B");

    globalThis.__sourcePreservationBinding = fixture.binding;
    const response = await vehicleRoute.POST(
      context({
        id: "DEMO-imported-A",
        title: "Edited title",
        brand: "DEMO-brand",
        model: "DEMO-model",
        cardTitleSupplement: "",
        subModel: "",
        year: "",
        mileage: "",
        exteriorColor: "",
        interiorColor: "",
        condition: "嚴選車況",
        status: "draft",
        headline: "",
        description: "",
        features: [],
        monthlyRecommended: false,
        showSoldCase: false,
        images: [],
      }),
    );
    assert.equal(response.status, 200);

    const savedA = fixture.getVehicle("DEMO-imported-A");
    assert.equal(savedA.title, "Edited title");
    assert.equal(
      savedA.source,
      "DEMO-feed",
      "admin-shaped edit must preserve source",
    );
    assert.equal(
      savedA.external_id,
      "DEMO-external-A",
      "admin-shaped edit must preserve externalId",
    );
    assert.equal(
      savedA.local_edits_json,
      importedEdits,
      "admin-shaped edit must preserve opaque local edits",
    );
    assert.deepEqual(
      fixture.getVehicleCopy("DEMO-unrelated-B"),
      beforeB,
      "unrelated vehicle remains unchanged",
    );
    assert.deepEqual(fixture.getMappings(), [
      {
        id: mapping.id,
        source: mapping.source,
        external_id: mapping.externalId,
        vehicle_id: mapping.vehicleId,
        last_imported_at: mapping.lastImportedAt,
      },
    ]);
  } finally {
    delete globalThis.__sourcePreservationBinding;
    fixture.close();
  }
});

test("new manual vehicles default identity metadata and explicit source identity overrides defaults", async () => {
  const fixture = makeD1();
  try {
    await repo.upsertVehicle(
      {
        id: "DEMO-manual",
        title: "Manual vehicle",
        brand: "DEMO-brand",
        model: "DEMO-model",
      },
      await fixture.db,
    );
    const manual = fixture.getVehicle("DEMO-manual");
    assert.equal(manual.source, "manual");
    assert.equal(manual.external_id, null);
    assert.equal(manual.local_edits_json, "[]");

    await repo.upsertVehicle(
      {
        id: "DEMO-explicit",
        title: "Explicit identity",
        brand: "DEMO-brand",
        model: "DEMO-model",
        source: "DEMO-explicit-source",
        externalId: "DEMO-explicit-id",
      },
      await fixture.db,
    );
    const explicit = fixture.getVehicle("DEMO-explicit");
    assert.equal(explicit.source, "DEMO-explicit-source");
    assert.equal(explicit.external_id, "DEMO-explicit-id");
    assert.equal(explicit.local_edits_json, "[]");
  } finally {
    fixture.close();
  }
});
