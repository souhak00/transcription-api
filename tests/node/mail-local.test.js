import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflow = JSON.parse(await read('n8n-workflows/mobile_courriel_test_local_v1.json'));
const execute = (name, json, extra = {}) => runInNewContext(
  `(function(){${workflow.nodes.find(n => n.name === name).parameters.jsCode}})()`,
  { $input: { first: () => ({ json }) }, ...extra }, { timeout: 1000 });
const fixture = () => execute('Donnees fictives', {})[0].json;

test('courriel de recette : workflow distinct, manuel, sans webhook ni LLM', () => {
  assert.equal(workflow.id, 'ToniaCourrielTestLocalV1');
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes[0].type, 'n8n-nodes-base.manualTrigger');
  assert.ok(workflow.nodes.every(n => !/webhook|httpRequest|gmail|postgres/i.test(n.type)));
  assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
  assert.equal(workflow.settings.saveDataErrorExecution, 'none');
  assert.equal(workflow.settings.saveManualExecutions, false);
});

test('le message fictif et tous les scripts n8n sont exécutables', () => {
  for (const node of workflow.nodes.filter(n => n.type.endsWith('.code'))) {
    assert.doesNotThrow(() => new Function(node.parameters.jsCode));
  }
  const data = fixture();
  assert.match(data.text, /TRANSCRIPTION FICTIVE/);
  assert.match(data.text, /NOTES PERSONNELLES FICTIVES/);
  assert.equal(execute('Verifier recette', data)[0].json.recipient, 'recette@example.invalid');
});

test('la recette refuse un destinataire externe, multiple, avec suffixe ou retour de ligne', () => {
  for (const recipient of ['test@example.net', 'recette@example.invalid.evil', 'a@example.invalid,b@example.invalid',
    'recette@example.invalid\n', 'nom <recette@example.invalid>', 'a@EXAMPLE.INVALID', '']) {
    assert.throws(() => execute('Verifier recette', { ...fixture(), recipient }), /Test local/);
  }
});

test('la recette refuse les sujets injectés et les contenus hors limites', () => {
  for (const patch of [{ subject: 'Tonia — TEST LOCAL — x\nBcc: x@example.net' },
    { subject: 'Autre' }, { text: '' }, { text: 'x'.repeat(650001) }]) {
    assert.throws(() => execute('Verifier recette', { ...fixture(), ...patch }), /Test local/);
  }
});

test('courriel local : expéditeur fixe, un destinataire et pas de relance automatique', () => {
  const node = workflow.nodes.find(n => n.type.endsWith('.emailSend'));
  assert.equal(node.retryOnFail, false);
  assert.equal(node.parameters.fromEmail, 'Tonia TEST LOCAL <tonia@example.invalid>');
  assert.equal(node.parameters.emailFormat, 'text');
  assert.equal(node.parameters.options.allowUnauthorizedCerts, false);
  assert.equal(node.credentials.smtp.id, 'ToniaSmtpLocalTestV1');
});

test('l’accusé de test ne prétend jamais avoir livré un courriel externe', () => {
  const extra = { $: () => ({ first: () => ({ json: fixture() }) }) };
  const result = execute('Confirmer acceptation locale', { messageId: 'fake', accepted: ['recette@example.invalid'], rejected: [] }, extra)[0].json;
  assert.equal(result.externalDelivery, false);
  assert.equal(result.mode, 'TEST_LOCAL');
  assert.throws(() => execute('Confirmer acceptation locale', { accepted: [] }, extra));
});

test('la connexion versionnée ne contient aucun secret et vise seulement le réseau de test', async () => {
  const [credential] = JSON.parse(await read('deploy/mail/n8n-smtp-test.credential.json'));
  assert.equal(credential.data.host, 'smtp-test');
  assert.equal(credential.data.port, 587);
  assert.equal(credential.data.password, '');
  assert.equal(credential.data.user, '');
});

test('production : le verrou et la file séparée sont conservés', async () => {
  const config = await read('deploy/mail/compose.outbound.yml');
  const gate = await read('deploy/mail/outbound-gate.sh');
  assert.match(config, /TONIA_MAIL_RELEASE:-blocked/);
  assert.match(config, /outbound_queue:\/var\/spool\/postfix/);
  assert.doesNotMatch(config, /test_queue|ports:/);
  assert.match(config, /POSTFIX_smtp_tls_security_level: encrypt/);
  assert.match(config, /POSTFIX_default_transport_rate_delay: "15s"/);
  assert.match(gate, /== 'approved'/);
  assert.match(gate, /domain\.private/);
  const production = JSON.parse(await read('n8n-workflows/mobile_envoi_note_v1.json'));
  assert.equal(production.active, false);
  assert.match(production.nodes.find(n => n.name === 'Verifier envoi').parameters.jsCode, /MOBILE_EMAIL_RELEASE === 'approved'/);
  const smtp = production.nodes.find(n => n.type.endsWith('.emailSend'));
  assert.equal(smtp.parameters.fromEmail, 'Tonia <administration@toniaconseil.com>');
  assert.equal(smtp.credentials.smtp.id, 'ToniaSmtpOutboundV1');
});

test('production : la connexion SMTP interne ne contient aucun secret ni port publié', async () => {
  const [credential] = JSON.parse(await read('deploy/mail/n8n-smtp-outbound.credential.json'));
  assert.equal(credential.data.host, 'smtp-outbound');
  assert.equal(credential.data.port, 587);
  assert.equal(credential.data.secure, false);
  assert.equal(credential.data.disableStartTls, true);
  assert.equal(credential.data.user, '');
  assert.equal(credential.data.password, '');
});

test('isolation de la recette : limites de ressources et aucune sortie SMTP publique', async () => {
  const config = await read('deploy/mail/compose.test.yml');
  assert.match(config, /internal: true/);
  assert.match(config, /127\.0\.0\.1:8025:8080/);
  assert.doesNotMatch(config, /MP_SMTP_RELAY|MP_SMTP_FORWARD|["'](?:0\.0\.0\.0:)?(?:25|587|1025):/);
  assert.match(config, /RELAYHOST: "\[mailpit\]:1025"/);
  assert.match(config, /172\.29\.240\.10\/32/);
  assert.match(config, /MP_MAX_AGE: "7d"/);
  assert.match(config, /MP_DISABLE_VERSION_CHECK: "true"/);
  assert.equal((config.match(/mem_limit:/g) ?? []).length, 3);
});
