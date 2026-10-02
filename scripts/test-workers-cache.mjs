import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.MITA_WORKER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(root, 'node_modules/.bin/wrangler');
const reportOnly = process.argv.includes('--report-only');
const persistTo = await mkdtemp(path.join(os.tmpdir(), 'mita-workers-cache-'));
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port: freePort } = server.address();
    server.close(() => resolve(freePort));
  });
});

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const configArgs = ['--local', '--persist-to', persistTo, '--config', path.join(root, 'wrangler.toml'), '--env', 'preview'];
let worker;
let workerOutput = '';
try {
  if (process.env.MITA_SKIP_BUILD !== '1') run('npm', ['run', 'build:workers']);
  run(wrangler, ['d1', 'migrations', 'apply', 'DB_PREVIEW', ...configArgs]);

  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const seed = [];
  for (let index = 0; index < 73; index++) {
    const id = `fixture-vehicle-${index}`;
    const slug = index === 0 ? 'B182' : `fixture-car-${index}`;
    seed.push(`INSERT INTO vehicles (id,slug,title,brand,model,year,mileage,status,monthly_recommended,created_at,updated_at) VALUES (${quote(id)},${quote(slug)},${quote(`Fixture premium car ${index}`)},${quote(`Brand ${index % 8}`)},${quote(`Model ${index}`)},'2022','10000 km','published',${index < 8 ? 1 : 0},'2025-01-01','2025-01-01');`);
    const imageCount = index === 0 ? 25 : 14;
    for (let image = 0; image < imageCount; image++) {
      seed.push(`INSERT INTO vehicle_images (id,vehicle_id,url,alt,sort_order,is_cover,created_at) VALUES (${quote(`fixture-image-${index}-${image}`)},${quote(id)},${quote(`/fixture/${index}/${image}.jpg`)},${quote(`Fixture ${index} image ${image}`)},${image},${image === 0 ? 1 : 0},'2025-01-01');`);
    }
  }
  seed.push("INSERT INTO site_settings (key,value,updated_at) VALUES ('siteName','Fixture Mita','2025-01-01'),('showSoldVehicles','false','2025-01-01');");
  const seedFile = path.join(persistTo, 'seed.sql');
  await writeFile(seedFile, seed.join('\n'));
  run(wrangler, ['d1', 'execute', 'DB_PREVIEW', ...configArgs, '--file', seedFile]);

  worker = spawn(wrangler, ['dev', '--local', '--persist-to', persistTo, '--config', path.join(root, 'wrangler.toml'), '--env', 'preview', '--port', String(port), '--var', 'SESSION_SECRET:integration-test-secret', '--log-level', 'info'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [worker.stdout, worker.stderr]) stream.setEncoding('utf8').on('data', (chunk) => { workerOutput += chunk; });

  const origin = `http://127.0.0.1:${port}`;
  const explorer = `${origin}/cdn-cgi/local/explorer/api/local/observability`;
  const waitUntilReady = async () => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`wrangler exited ${worker.exitCode}:\n${workerOutput}`);
      try {
        const response = await fetch(`${origin}/cdn-cgi/health-check`);
        if (response.status < 500) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`wrangler did not become ready:\n${workerOutput}`);
  };
  await waitUntilReady();

  const querySpans = async () => {
    const response = await fetch(`${explorer}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT trace_id, name, start_ms, json(attributes) AS attributes, error FROM spans ORDER BY start_ms' }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.success, true, JSON.stringify(payload));
    const [columns, ...rows] = [payload.result.columns, ...payload.result.rows];
    return rows.map((values) => {
      const span = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      const attributes = typeof span.attributes === 'string' ? JSON.parse(span.attributes) : span.attributes;
      return {
        trace_id: span.trace_id,
        name: span.name,
        start_ms: span.start_ms,
        url: attributes?.['url.full'],
        rows_read: attributes?.['cloudflare.d1.response.rows_read'],
        cache_status: attributes?.['cache.response.cache_status'],
        cache_success: attributes?.['cache.response.success'],
        cache_key: attributes?.['cache.request.url'],
        error: span.error,
      };
    });
  };
  const clearSpans = async () => {
    const response = await fetch(`${explorer}/clear`, { method: 'POST' });
    assert.equal(response.status, 200, await response.text());
  };

  const results = [];
  for (const pathname of ['/', '/cars', '/cars/B182', '/admin/login']) {
    await clearSpans();
    const requests = [];
    for (let requestNumber = 1; requestNumber <= 3; requestNumber++) {
      const response = await fetch(`${origin}${pathname}`);
      await response.arrayBuffer();
      results.push({ pathname, requestNumber, status: response.status });
      assert.equal(response.status, 200, `${pathname} request ${requestNumber}; Wrangler output:\n${workerOutput}`);
      requests.push({ pathname, requestNumber, originPath: `${origin}${pathname}` });
    }
    const spans = await querySpans();
    const rootSpans = spans.filter((span) => span.name === 'GET' && span.url && new URL(span.url).pathname === pathname);
    assert.equal(rootSpans.length, requests.length, `expected ${requests.length} root spans for ${pathname}; got ${rootSpans.length}`);
    for (const [index, request] of requests.entries()) {
      const rootSpan = rootSpans[index];
      assert.ok(rootSpan, `no root request trace for ${request.pathname} request ${request.requestNumber}; spans=${JSON.stringify(spans)}`);
      const trace = spans.filter((span) => span.trace_id === rootSpan.trace_id);
      const rowsRead = trace.reduce((sum, span) => sum + Number(span.rows_read || 0), 0);
      const cacheSpan = trace.find((span) => span.name === 'cache_match');
      const cacheStatus = cacheSpan?.cache_status ?? 'NOT_CHECKED';
      const result = results.find((row) => row.pathname === request.pathname && row.requestNumber === request.requestNumber);
      result.rowsRead = rowsRead;
      result.cache = cacheStatus;
      if (!reportOnly && request.pathname !== '/admin/login') {
        assert.equal(cacheStatus, request.requestNumber === 1 ? 'MISS' : 'HIT', `${request.pathname} request ${request.requestNumber} cache status; spans=${JSON.stringify(trace)}`);
        if (request.requestNumber > 1) assert.equal(rowsRead, 0, `${request.pathname} cache hit must read zero D1 rows`);
      } else if (!reportOnly) {
        assert.equal(cacheStatus, 'NOT_CHECKED', 'admin login must remain outside the public HTML cache');
      }
    }
  }
  console.log('Workers cache integration passed (Wrangler local runtime, real caches.default):');
  console.table(results);
} catch (error) {
  console.error(error);
  console.error('Wrangler output:\n' + workerOutput);
  process.exitCode = 1;
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((resolve) => worker.once('exit', resolve));
  }
  await rm(persistTo, { recursive: true, force: true });
}
