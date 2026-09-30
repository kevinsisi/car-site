import assert from 'node:assert/strict';
import { cpuUsage } from 'node:process';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import { hashPassword, verifyPassword } from '../../src/lib/crypto.ts';

const COMPATIBILITY_DATE = '2026-09-30';
const SYNTHETIC_PASSWORD = 'synthetic-cross-runtime-password';
const SYNTHETIC_WRONG_PASSWORD = 'synthetic-wrong-password';
const SYNTHETIC_SALT = 'synthetic-cross-runtime-salt';
const SYNTHETIC_WORKER_PASSWORD = 'synthetic-worker-produced-password';

test('scrypt password format is compatible between Node and a local Worker', async () => {
  const nodeStored = hashPassword(SYNTHETIC_PASSWORD);
  const worker = new Miniflare({
    workers: [
      {
        config: {
          name: 'password-compat-probe',
          compatibilityDate: COMPATIBILITY_DATE,
          compatibilityFlags: ['nodejs_compat'],
          unsafe: {},
          manifest: {
            mainModule: 'password-compat-worker.mjs',
            modulesRoot: '/',
            modules: {
              'password-compat-worker.mjs': {
                type: 'esm',
                contents: `
                  import { scryptSync, timingSafeEqual } from 'node:crypto';

                  const salt = ${JSON.stringify(SYNTHETIC_SALT)};
                  const workerPassword = ${JSON.stringify(SYNTHETIC_WORKER_PASSWORD)};
                  const wrongPassword = ${JSON.stringify(SYNTHETIC_WRONG_PASSWORD)};

                  function encode(password) {
                    return 'scrypt:' + salt + ':' + scryptSync(password, salt, 64).toString('hex');
                  }

                  function verify(password, stored) {
                    const [scheme, storedSalt, hash] = stored.split(':');
                    if (scheme !== 'scrypt' || !storedSalt || !hash) return false;
                    const candidate = scryptSync(password, storedSalt, 64);
                    const expected = Buffer.from(hash, 'hex');
                    return expected.length === candidate.length && timingSafeEqual(candidate, expected);
                  }

                  export default {
                    async fetch(request) {
                      const startedAt = performance.now();
                      const { nodeStored } = await request.json();
                      const nodeToWorkerAccepted = verify(${JSON.stringify(SYNTHETIC_PASSWORD)}, nodeStored);
                      const nodeToWorkerRejectedWrongPassword = !verify(wrongPassword, nodeStored);
                      const workerStored = encode(workerPassword);
                      const elapsedMs = performance.now() - startedAt;
                      return Response.json({
                        nodeToWorkerAccepted,
                        nodeToWorkerRejectedWrongPassword,
                        workerStored,
                        elapsedMs,
                      });
                    },
                  };
                `,
              },
            },
          },
        },
      },
    ],
  });

  const cpuStarted = cpuUsage();
  const elapsedStarted = performance.now();
  try {
    const response = await worker.dispatchFetch('http://local.test/password-compat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeStored }),
    });
    const elapsedMs = performance.now() - elapsedStarted;
    const cpu = cpuUsage(cpuStarted);

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.nodeToWorkerAccepted, true);
    assert.equal(result.nodeToWorkerRejectedWrongPassword, true);
    assert.equal(typeof result.workerStored, 'string');
    assert.equal(verifyPassword(SYNTHETIC_WORKER_PASSWORD, result.workerStored), true);
    assert.equal(verifyPassword(SYNTHETIC_WRONG_PASSWORD, result.workerStored), false);
    assert.ok(Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0);

    // Emit measurements only; never print synthetic credentials or encoded hashes.
    console.log(
      JSON.stringify({
        probe: 'local-miniflare-scrypt-compatibility',
        elapsedMs,
        workerElapsedMs: result.elapsedMs,
        processCpuUserMs: cpu.user / 1000,
        processCpuSystemMs: cpu.system / 1000,
        nodeToWorkerAccepted: result.nodeToWorkerAccepted,
        workerToNodeAccepted: true,
        wrongPasswordsRejected: true,
      }),
    );
  } finally {
    await worker.dispose();
  }
});
