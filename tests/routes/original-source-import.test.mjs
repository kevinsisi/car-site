import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/vehicle-status") {
      return {
        url: `data:text/javascript,${encodeURIComponent("export function isVehicleStatus(value) { return ['draft','published','incoming','reserved','special','unknown','unpublished','sold','archived'].includes(value); }")}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/config") {
      return {
        url: `data:text/javascript,${encodeURIComponent("export const appConfig = { importApiToken: 'DEMO-node-token' };")}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import("../../src/pages/api/import/cars.ts");
const { createD1Db } = await import("../../src/db/d1.ts");
const token = "DEMO-worker-import-token";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE vehicles (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      card_title_supplement TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL, model TEXT NOT NULL,
      sub_model TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '', mileage TEXT NOT NULL DEFAULT '',
      exterior_color TEXT NOT NULL DEFAULT '', interior_color TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft', headline TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      features_json TEXT NOT NULL DEFAULT '[]', monthly_recommended INTEGER NOT NULL DEFAULT 0,
      show_sold_case INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', external_id TEXT,
      local_edits_json TEXT NOT NULL DEFAULT '[]', sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX vehicles_source_external_idx ON vehicles(source, external_id);
    CREATE TABLE vehicle_images (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE import_mappings (id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), last_imported_at TEXT NOT NULL);
    CREATE UNIQUE INDEX import_mappings_source_external_idx ON import_mappings(source, external_id);
    CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO vehicles (id, slug, title, brand, model, source, external_id, created_at, updated_at)
      VALUES ('DEMO-unrelated-B', 'unrelated-b', 'Untouched B', 'DEMO-brand-B', 'DEMO-model-B', 'DEMO-other-source', 'DEMO-other-id', 'DEMO-created', 'DEMO-updated');
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
    count(table) {
      return sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
        .count;
    },
    vehicleByExternal(source, externalId) {
      return sqlite
        .prepare("SELECT * FROM vehicles WHERE source = ? AND external_id = ?")
        .get(source, externalId);
    },
    unrelated() {
      return sqlite
        .prepare("SELECT * FROM vehicles WHERE id = 'DEMO-unrelated-B'")
        .get();
    },
    close() {
      sqlite.close();
    },
  };
}

function context(body, { authenticated = true, env = {} } = {}) {
  return {
    request: new Request("https://preview.example/api/import/cars", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    locals: {
      runtime: {
        env: {
          DB_PREVIEW: globalThis.__originalSourceBinding,
          IMPORT_PREVIEW_TOKEN: token,
          ...env,
        },
      },
    },
  };
}

function valid(source, externalId, overrides = {}) {
  return {
    source,
    externalId,
    brand: "DEMO-brand",
    model: "DEMO-model",
    photos: ["/media/DEMO-photo.webp"],
    ...overrides,
  };
}

test("Worker accepts both established source namespaces and idempotently imports through real D1 adapter", async (t) => {
  for (const source of ["sheet-to-car", "carsmeet-sheet-to-car"]) {
    await t.test(source, async () => {
      const data = fixture();
      globalThis.__originalSourceBinding = data.binding;
      const beforeB = data.unrelated();
      try {
        const input = valid(source, `external-${source}-001`);
        const first = await POST(context(input));
        assert.equal(first.status, 200);
        const firstBody = await first.json();
        const second = await POST(context(input));
        assert.equal(second.status, 200);
        const secondBody = await second.json();
        assert.equal(firstBody.vehicleId, secondBody.vehicleId);
        assert.equal(data.count("vehicles"), 2);
        assert.equal(data.count("import_mappings"), 1);
        assert.equal(
          data.vehicleByExternal(source, input.externalId).id,
          firstBody.vehicleId,
        );
        assert.deepEqual(data.unrelated(), beforeB);
      } finally {
        data.close();
      }
    });
  }
});

test("Worker source gate retains auth, preview fixture restriction, and same-origin photo restriction", async () => {
  const data = fixture();
  globalThis.__originalSourceBinding = data.binding;
  try {
    assert.equal(
      (
        await POST(
          context(valid("sheet-to-car", "external-unauthenticated"), {
            authenticated: false,
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (await POST(context(valid("unrecognized-source", "external-unknown"))))
        .status,
      400,
    );
    assert.equal(
      (await POST(context(valid("preview", "external-non-demo")))).status,
      400,
    );
    assert.equal(
      (
        await POST(
          context(
            valid("carsmeet-sheet-to-car", "external-off-origin", {
              photos: ["https://elsewhere.example/photo.jpg"],
            }),
          ),
        )
      ).status,
      400,
    );
    const demo = await POST(context(valid("preview", "DEMO-existing-preview")));
    assert.equal(demo.status, 200);
  } finally {
    data.close();
  }
});
