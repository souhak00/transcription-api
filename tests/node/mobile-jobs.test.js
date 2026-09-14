import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MOBILE_FIELDS, sourceHash, normalizeMobileJob, segmentMobileSources, collectMobileFacts,
  mobileReviewResult, mobileEmail, validMobileEmail, createMobileService } from '../../src/mobile.js';

const input = (changes = {}) => ({ kind: 'ANALYSIS', noteId: '12345678-1234-1234-1234-123456789012', revision: 1,
  transcript: 'Le client est Alex Exemple.', personalNotes: 'À confirmer ensemble.', association: { state: 'UNASSIGNED' }, ...changes });
const alice = { subject: 'alice', representantId: '12345678-1234-4234-8234-123456789012',
  email: 'test@example.invalid', emailVerified: true, role: 'representant' };
const bob = { ...alice, subject: 'bob', representantId: '22345678-1234-4234-8234-123456789012' };
const emailInput = () => {
  const body = input({ kind: 'EMAIL', status: 'FINALIZED', sendConfirmed: true, summary: 'Résumé relu.' });
  return { ...body, review: { sourceHash: sourceHash(body.transcript, body.personalNotes), recipientEmail: 'test@example.invalid', recipientConfirmed: true,
    rows: MOBILE_FIELDS.map(field => ({ field, value: '', decision: 'NOT_PROVIDED' })) } };
};
const env = { N8N_MOBILE_TOKEN: 'synthetic-test-only', N8N_MOBILE_ANALYSIS_WEBHOOK_URL: 'http://private.invalid/analysis', N8N_MOBILE_EMAIL_WEBHOOK_URL: 'http://private.invalid/email' };
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tonia-mobile-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('les sources longues sont conservées intégralement et séparées', () => {
  const body = normalizeMobileJob(input({ transcript: 'A'.repeat(17001), personalNotes: 'B'.repeat(8010) }));
  const segments = segmentMobileSources(body);
  assert.equal(segments.length, 5);
  assert.ok(segments.every(part => part.text.length <= 8000));
  assert.equal(segments.filter(s => s.source === 'TRANSCRIPT').map(s => s.text).join(''), body.transcript);
  assert.equal(segments.filter(s => s.source === 'PERSONAL_NOTES').map(s => s.text).join(''), body.personalNotes);
  assert.throws(() => segmentMobileSources(body, 0));
  assert.throws(() => normalizeMobileJob(input({ transcript: 'A'.repeat(500001) })));
});

test('les propositions sans preuve sont rejetées et les contradictions restent à revoir', () => {
  const segment = { source: 'TRANSCRIPT', text: 'Le client est Alex Exemple.' };
  let facts = collectMobileFacts([], { facts: [null,
    { field: 'NOM_CLIENT', value: 'Alex Exemple', evidence: 'Alex Exemple' },
    { field: 'DETTES', value: '100000', evidence: 'dette inventée' },
    { field: 'ADMIN', value: 'oui', evidence: 'Alex Exemple' }
  ] }, segment);
  assert.equal(facts.length, 1);
  facts = collectMobileFacts(facts, { facts: [{ field: 'NOM_CLIENT', value: 'Alex Autre', evidence: 'Alex Autre' }] },
    { source: 'PERSONAL_NOTES', text: 'Vérifier Alex Autre' });
  const review = mobileReviewResult(facts, normalizeMobileJob(input()));
  assert.equal(review.rows[0].source, 'CONFLICT');
  assert.equal(review.rows[0].value, '');
  assert.ok(review.rows.every(row => row.decision === 'TO_REVIEW'));
});

test('aucun courriel sans validation actuelle de chaque champ et du destinataire', () => {
  assert.doesNotThrow(() => normalizeMobileJob(emailInput()));
  for (const change of [{ status: 'DRAFT' }, { sendConfirmed: false }, { transcript: 'Texte modifié' }]) {
    assert.throws(() => normalizeMobileJob({ ...emailInput(), ...change }));
  }
  for (const change of [{ recipientConfirmed: false }, { recipientEmail: 'a@test.invalid,b@test.invalid' },
    { rows: [] }, { rows: Array(12).fill(null) }, { rows: Array(12).fill({ field: 'NOM_CLIENT', value: '', decision: 'NOT_PROVIDED' }) }]) {
    const body = emailInput(); Object.assign(body.review, change);
    assert.throws(() => normalizeMobileJob(body));
  }
  for (const address of ['test@example.invalid\nBcc:evil@example.invalid', 'a@b', ' a@test.invalid', 'a..b@test.invalid']) assert.equal(validMobileEmail(address), false);
  assert.equal(validMobileEmail('prenom.nom+test@example.invalid'), true);
  const mail = mobileEmail(normalizeMobileJob(emailInput()));
  assert.equal(mail.recipient, 'test@example.invalid');
  for (const content of ['Le client est Alex Exemple.', 'À confirmer ensemble.', 'Résumé relu.']) assert.ok(mail.text.includes(content));
  assert.equal(mail.audio, undefined);
});

test('configuration absente : aucun appel ni faux envoi', async t => {
  const service = createMobileService({ directory: await temporary(t), env: {}, fetchImpl: () => assert.fail('network forbidden') });
  assert.deepEqual(service.configured, { analysis: false, email: false, summaryEmail: false, clientAssociation: true });
  await assert.rejects(service.submit({}, emailInput()), { statusCode: 403 });
  await assert.rejects(service.submit(alice, emailInput()), { statusCode: 503 });
  await service.idle();
});

test('travaux persistants, isolation des comptes et déduplication', async t => {
  const directory = await temporary(t); let calls = 0;
  const service = createMobileService({ directory, env, fetchImpl: async () => { calls++; return response({ facts: [] }); } });
  const [first, duplicate] = await Promise.all([service.submit(alice, input()), service.submit(alice, input())]);
  assert.equal(first.id, duplicate.id);
  await service.idle();
  assert.equal(calls, 2); // One segment for each of the two distinct sources.
  assert.equal((await service.get(alice, first.id)).status, 'READY');
  await assert.rejects(service.get(bob, first.id), { statusCode: 404 });
  await assert.rejects(service.get(alice, '../escape'), { statusCode: 404 });
  const restarted = createMobileService({ directory, env, fetchImpl: () => assert.fail('finished job must not repeat') });
  assert.equal((await restarted.get(alice, first.id)).status, 'READY');
  await restarted.idle();
});

test('un envoi incertain ne se répète ni au clic ni au redémarrage', async t => {
  const directory = await temporary(t); let calls = 0;
  const service = createMobileService({ directory, env, fetchImpl: async () => { calls++; throw new Error('timeout after acceptance'); } });
  const job = await service.submit(alice, emailInput());
  await service.idle();
  assert.equal((await service.get(alice, job.id)).status, 'UNKNOWN');
  assert.equal((await service.submit(alice, emailInput())).id, job.id);
  const restarted = createMobileService({ directory, env, fetchImpl: () => assert.fail('mail must not repeat') });
  await restarted.idle();
  assert.equal((await restarted.get(alice, job.id)).status, 'UNKNOWN');
  assert.equal(calls, 1);
});

test('accepté par SMTP n’est pas livré au destinataire', async t => {
  const service = createMobileService({ directory: await temporary(t), env, fetchImpl: async () => response({ accepted: true, messageId: 'synthetic-id' }) });
  const job = await service.submit(alice, emailInput()); await service.idle();
  assert.equal((await service.get(alice, job.id)).status, 'ACCEPTED');
});

test('reprise après arrêt : analyse depuis son segment validé, mail SENDING devient UNKNOWN', async t => {
  const directory = await temporary(t);
  const original = createMobileService({ directory, env, fetchImpl: async () => response({ facts: [] }) });
  const job = await original.submit(alice, input()); await original.idle();
  const file = path.join(directory, `${job.id}.json`);
  const data = JSON.parse(await readFile(file, 'utf8'));
  Object.assign(data, { status: 'RUNNING', cursor: 1, result: null });
  await writeFile(file, JSON.stringify(data));
  let calls = 0;
  const resumed = createMobileService({ directory, env, fetchImpl: async (_url, options) => {
    calls++; assert.equal(JSON.parse(options.body).source, 'PERSONAL_NOTES'); return response({ facts: [] });
  } });
  await resumed.idle();
  assert.equal(calls, 1);
  Object.assign(data, { status: 'SENDING', input: normalizeMobileJob(emailInput()) });
  await writeFile(file, JSON.stringify(data));
  const unknown = createMobileService({ directory, env, fetchImpl: () => assert.fail('never resend') });
  await unknown.idle();
  assert.equal((await unknown.get(alice, job.id)).status, 'UNKNOWN');
});

test('limitation par utilisateur et traitement unique même avec ajouts concurrents', async t => {
  let active = 0; let maxActive = 0;
  const service = createMobileService({ directory: await temporary(t), env, fetchImpl: async () => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--; return response({ facts: [] });
  } });
  for (let revision = 1; revision <= 6; revision++) { await service.submit(alice, input({ revision })); await service.idle(); }
  await assert.rejects(service.submit(alice, input({ revision: 7 })), { statusCode: 429 });
  assert.equal(maxActive, 1);
});
