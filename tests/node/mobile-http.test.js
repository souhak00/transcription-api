import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

test('routes HTTP mobiles : configuration sans secret, identité signée, aucun envoi non configuré', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'tonia-http-test-'));
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-only', alg: 'RS256', use: 'sig' };
  const identityServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ keys: [jwk] }));
  });
  identityServer.listen(0, '127.0.0.1'); await once(identityServer, 'listening');
  const issuer = `http://127.0.0.1:${identityServer.address().port}`;
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, [fileURLToPath(new URL('../../src/server.js', import.meta.url))], {
    cwd: temporary, windowsHide: true, stdio: 'ignore', env: { ...process.env,
      HOST: '127.0.0.1', PORT: String(port), KEYCLOAK_ISSUER: issuer, KEYCLOAK_JWKS_URL: `${issuer}/keys`, KEYCLOAK_AUDIENCE: 'crm-api',
      KEYCLOAK_PUBLIC_URL: 'https://identity.example.invalid', KEYCLOAK_REALM: 'test-only',
      N8N_MOBILE_TOKEN: '', N8N_MOBILE_ANALYSIS_WEBHOOK_URL: '', N8N_MOBILE_SUMMARY_WEBHOOK_URL: '', N8N_MOBILE_EMAIL_WEBHOOK_URL: '' }
  });
  t.after(async () => {
    if (server.exitCode === null) { const closed = once(server, 'exit'); server.kill(); await closed; }
    await new Promise(resolve => identityServer.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  });
  const endpoint = `http://127.0.0.1:${port}`;
  let config;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { config = await fetch(`${endpoint}/api/mobile/config`); break; }
    catch { if (server.exitCode !== null) assert.fail('API test failed to start'); await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  assert.equal(config?.status, 200);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  const publicConfig = await config.json();
  assert.equal(publicConfig.analysis, false); assert.equal(publicConfig.email, false);
  assert.equal(publicConfig.summaryEmail, false);
  assert.equal(publicConfig.clientId, 'crm-mobile'); assert.equal(publicConfig.token, undefined);
  for (const route of ['session', 'jobs', `jobs/${'a'.repeat(64)}`]) assert.equal((await fetch(`${endpoint}/api/mobile/${route}`)).status, 401);
  const token = await new SignJWT({ name: 'Test fictif', email: 'test@example.invalid', email_verified: true, azp: 'crm-mobile', realm_access: { roles: ['representant'] }, representant_id: '12345678-1234-4234-8234-123456789012' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-only' }).setIssuer(issuer).setAudience('crm-api').setSubject('test-mobile-only').setIssuedAt().setExpirationTime('2m').sign(privateKey);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const webToken = await new SignJWT({ name: 'Test Web', email: 'test@example.invalid', email_verified: true, azp: 'crm-web', realm_access: { roles: ['representant'] }, representant_id: '12345678-1234-4234-8234-123456789012' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-only' }).setIssuer(issuer).setAudience('crm-api').setSubject('test-mobile-only').setIssuedAt().setExpirationTime('2m').sign(privateKey);
  assert.equal((await fetch(`${endpoint}/api/mobile/session`, { headers: { authorization: `Bearer ${webToken}` } })).status, 403);
  const session = await fetch(`${endpoint}/api/mobile/session`, { headers });
  assert.equal(session.status, 200); const sessionBody = await session.json(); assert.equal(sessionBody.name, 'Test fictif'); assert.equal(sessionBody.email, 'test@example.invalid');
  const job = await fetch(`${endpoint}/api/mobile/jobs`, { headers, method: 'POST', body: JSON.stringify({ kind: 'ANALYSIS',
    noteId: '12345678-1234-4234-8234-123456789012', revision: 1, transcript: 'Source fictive de test.', personalNotes: '', association: { state: 'UNASSIGNED' } }) });
  assert.equal(job.status, 503);
  const { sourceHash } = await import('../../src/mobile.js');
  const delivery = { kind: 'SUMMARY_EMAIL', noteId: '12345678-1234-4234-8234-123456789012', revision: 1,
    status: 'FINALIZED', sendConfirmed: true, transcript: 'Source fictive.', personalNotes: '', association: { state: 'UNASSIGNED' },
    delivery: { sourceHash: sourceHash('Source fictive.', ''), recipientEmail: 'test@example.invalid', recipientConfirmed: true } };
  const unconfigured = await fetch(`${endpoint}/api/mobile/jobs`, { headers, method: 'POST', body: JSON.stringify(delivery) });
  assert.equal(unconfigured.status, 503);
  assert.match((await unconfigured.json()).error, /synthèse/);
  assert.equal((await fetch(`${endpoint}/api/mobile/jobs/${'a'.repeat(64)}`, { headers })).status, 404);
});
