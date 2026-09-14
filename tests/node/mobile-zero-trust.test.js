import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { authorizeMobileClient, listMobileClients } from '../../src/mobile-clients.js';
import { createMobileService, sourceHash } from '../../src/mobile.js';

const representativeId = '12345678-1234-4234-8234-123456789012';
const identity = { subject: 'rep-keycloak', representantId: representativeId,
  email: 'rep@example.invalid', emailVerified: true, role: 'representant' };
const client = { code_client: 'CLI-2026-AB-000001', nom_client: 'Alice Beaulieu', statut_dossier: 'Nouveau' };
const response = value => new Response(JSON.stringify(value));
async function temporary(t) { const directory = await mkdtemp(path.join(tmpdir(), 'tonia-zero-trust-')); t.after(() => rm(directory, { recursive: true, force: true })); return directory; }

test('la recherche mobile ne retourne que les champs minimaux du portefeuille autorisé', async () => {
  let receivedRepresentative;
  const clients = await listMobileClients(representativeId, 'alice', { requestPortfolio: async (_query, options) => {
    receivedRepresentative = options.representativeId;
    return { rows: [client, { ...client, code_client: 'invalide' }, { code_client: 'CLI-2026-BO-000002', nom_client: 'Bob Exemple', revenu_annuel: 999999 }] };
  } });
  assert.equal(receivedRepresentative, representativeId);
  assert.deepEqual(clients, [{ clientCode: client.code_client, clientName: client.nom_client, status: client.statut_dossier }]);
  assert.equal(clients[0].revenu_annuel, undefined);
});

test('le contrôle exact du dossier est exécuté dans le contexte du représentant', async () => {
  let received;
  const allowed = await authorizeMobileClient(representativeId, client.code_client.toLowerCase(), { requestPortfolio: async (query, options) => {
    received = { query, options }; return { rows: [client] };
  } });
  assert.deepEqual(received.query.selectionCodes, [client.code_client]);
  assert.equal(received.options.representativeId, representativeId);
  assert.equal(allowed.clientCode, client.code_client);
  await assert.rejects(authorizeMobileClient(representativeId, 'CLI-2026-ZZ-000999', { requestPortfolio: async () => ({ rows: [] }) }), { statusCode: 404 });
});

test('le serveur lie le travail au représentant, au dossier canonique et au courriel vérifié', async t => {
  const calls = [];
  const service = createMobileService({ directory: await temporary(t),
    env: { N8N_MOBILE_TOKEN: 'test', N8N_MOBILE_ANALYSIS_WEBHOOK_URL: 'http://private.invalid/analyse' },
    authorizeClient: async (rep, code) => { calls.push({ rep, code }); return { clientCode: code, clientName: 'Alice Beaulieu', status: 'Nouveau' }; },
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); assert.equal(body.representativeId, representativeId); assert.equal(body.association.clientCode, client.code_client); return response({ facts: [] }); }
  });
  const job = await service.submit(identity, { kind: 'ANALYSIS', noteId: '12345678-1234-4234-8234-123456789012', revision: 1,
    transcript: 'Conversation fictive.', personalNotes: '', association: { state: 'ASSIGNED', clientCode: client.code_client } });
  await service.idle();
  const result = await service.get(identity, job.id);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.association, { state: 'ASSIGNED', clientCode: client.code_client, clientName: 'Alice Beaulieu', status: 'Nouveau' });
  assert.equal(calls.length, 2, 'autorisation à la soumission puis avant traitement');
});

test('un changement de droit avant le courriel arrête le traitement', async t => {
  let authorizations = 0; let emails = 0;
  const service = createMobileService({ directory: await temporary(t),
    env: { N8N_MOBILE_TOKEN: 'test', N8N_MOBILE_SUMMARY_WEBHOOK_URL: 'http://private.invalid/summary', N8N_MOBILE_EMAIL_WEBHOOK_URL: 'http://private.invalid/email' },
    authorizeClient: async (_rep, code) => {
      authorizations++;
      if (authorizations >= 3) { const error = new Error('Accès retiré'); error.statusCode = 404; throw error; }
      return { clientCode: code, clientName: 'Alice Beaulieu', status: 'Nouveau' };
    },
    fetchImpl: async url => { if (url.endsWith('/summary')) return response({ summary: 'Résumé à vérifier.' }); emails++; return response({ accepted: true, messageId: 'forbidden' }); }
  });
  const transcript = 'Conversation fictive.';
  const body = { kind: 'SUMMARY_EMAIL', noteId: '12345678-1234-4234-8234-123456789012', revision: 1,
    status: 'FINALIZED', sendConfirmed: true, title: 'Test', transcript, personalNotes: '',
    association: { state: 'ASSIGNED', clientCode: client.code_client },
    delivery: { sourceHash: sourceHash(transcript, ''), recipientEmail: identity.email, recipientConfirmed: true } };
  const job = await service.submit(identity, body); await service.idle();
  const state = await service.get(identity, job.id);
  assert.equal(state.status, 'FAILED'); assert.equal(emails, 0);
  assert.match(state.error, /Aucun courriel envoyé/);
});

test('un autre courriel, un compte non vérifié ou un administrateur sont refusés', async t => {
  const service = createMobileService({ directory: await temporary(t), env: {
    N8N_MOBILE_TOKEN: 'test', N8N_MOBILE_SUMMARY_WEBHOOK_URL: 'http://private.invalid/summary', N8N_MOBILE_EMAIL_WEBHOOK_URL: 'http://private.invalid/email'
  } });
  const transcript = 'Test.';
  const body = { kind: 'SUMMARY_EMAIL', noteId: '12345678-1234-4234-8234-123456789012', revision: 1,
    status: 'FINALIZED', sendConfirmed: true, transcript, personalNotes: '', association: { state: 'UNASSIGNED' },
    delivery: { sourceHash: sourceHash(transcript, ''), recipientEmail: 'other@example.invalid', recipientConfirmed: true } };
  await assert.rejects(service.submit(identity, body), { statusCode: 403 });
  await assert.rejects(service.submit({ ...identity, emailVerified: false }, { ...body, delivery: { ...body.delivery, recipientEmail: identity.email } }), { statusCode: 403 });
  await assert.rejects(service.submit({ ...identity, role: 'admin' }, { ...body, delivery: { ...body.delivery, recipientEmail: identity.email } }), { statusCode: 403 });
});
