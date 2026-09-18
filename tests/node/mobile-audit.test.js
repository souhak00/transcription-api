import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMobileAuditLogger } from '../../src/mobile-audit.js';

const actorHash = 'a'.repeat(64);
const jobId = 'b'.repeat(64);
const representativeId = '11111111-1111-4111-8111-111111111111';

test('le journal mobile conserve uniquement les métadonnées Zero Trust', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tonia-audit-'));
  t.after(async () => { const { rm } = await import('node:fs/promises'); await rm(directory, { recursive: true, force: true }); });
  const audit = createMobileAuditLogger({ directory, now: () => new Date('2026-09-13T14:15:16.000Z') });

  await audit({ action: 'JOB_SUBMITTED', result: 'ACCEPTED', actorHash,
    representativeId, jobId, clientCode: 'CLI-2026-BT-000060',
    transcript: 'secret client', personalNotes: 'secret représentant',
    token: 'jeton-secret', email: 'personne@example.com' });

  assert.deepEqual(await readdir(directory), ['2026-09-13.jsonl']);
  const raw = await readFile(path.join(directory, '2026-09-13.jsonl'), 'utf8');
  assert.deepEqual(JSON.parse(raw), {
    timestamp: '2026-09-13T14:15:16.000Z', action: 'JOB_SUBMITTED', result: 'ACCEPTED',
    actorHash, representativeId, jobId, clientCode: 'CLI-2026-BT-000060'
  });
  for (const secret of ['secret client', 'secret représentant', 'jeton-secret', 'personne@example.com']) {
    assert.equal(raw.includes(secret), false);
  }
});

test('le journal refuse les événements non conformes', async () => {
  const audit = createMobileAuditLogger({ directory: path.join(tmpdir(), 'tonia-audit-invalid') });
  await assert.rejects(() => audit({ action: 'LOGIN', result: 'OK', actorHash,
    representativeId, jobId, clientCode: null }), /invalide/);
  await assert.rejects(() => audit({ action: 'JOB_STATUS', result: 'FAILED', actorHash: 'identité-brute',
    representativeId, jobId, clientCode: null }), /invalide/);
});
