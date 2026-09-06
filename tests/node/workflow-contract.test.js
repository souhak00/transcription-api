import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../../n8n-workflows/crm_agent_webhook_mvp.json",
  import.meta.url
);

async function loadWorkflow() {
  return JSON.parse(await readFile(workflowUrl, "utf8"));
}

test("le workflow Web accepte le contrat agent 1.0", async () => {
  const workflow = await loadWorkflow();
  const prepare = workflow.nodes.find((node) => node.name === "Préparer requête");
  const respond = workflow.nodes.find((node) => node.name === "Répondre à l’interface");

  assert.match(prepare.parameters.jsCode, /body\.command \?\? body/);
  assert.match(prepare.parameters.jsCode, /command\.schema_version !== '1\.0'/);
  assert.match(prepare.parameters.jsCode, /security\.representant_id/);
  assert.match(respond.parameters.responseBody, /schema_version: '1\.0'/);
  assert.match(respond.parameters.responseBody, /request_id/);
});

test("chaque outil PostgreSQL initialise le contexte représentant", async () => {
  const workflow = await loadWorkflow();
  const postgresNodes = workflow.nodes.filter((node) =>
    ["n8n-nodes-base.postgres", "n8n-nodes-base.postgresTool"].includes(node.type)
  );

  assert.ok(postgresNodes.length >= 8);
  for (const node of postgresNodes) {
    assert.match(node.parameters.query, /set_config\('app\.role'/, node.name);
    assert.match(node.parameters.query, /set_config\('app\.representant_id'/, node.name);
    assert.match(node.parameters.query, /crm\./, node.name);
  }
});

test("le workflow expose la consultation déterministe des documents manquants", async () => {
  const workflow = await loadWorkflow();
  const webhook = workflow.nodes.find((node) =>
    node.name === "Webhook - Documents manquants"
  );
  const service = workflow.nodes.find((node) =>
    node.name === "CRM - Clients avec documents manquants"
  );
  const formatter = workflow.nodes.find((node) =>
    node.name === "Formater documents manquants"
  );

  assert.equal(webhook.parameters.path, "crm/documents-manquants");
  assert.match(service.parameters.query, /crm\.obtenir_clients_documents_manquants\(20\)/);
  assert.match(formatter.parameters.jsCode, /documents_manquants/);
  assert.ok(workflow.connections[webhook.name]);
});

test("le workflow dossier utilise le service hypothécaire enrichi", async () => {
  const workflow = await loadWorkflow();
  const dossierServices = workflow.nodes.filter((node) =>
    ["n8n-nodes-base.postgres", "n8n-nodes-base.postgresTool"].includes(node.type)
      && String(node.parameters?.query).includes("obtenir_dossier_hypothecaire")
  );

  assert.ok(dossierServices.length >= 2);
});

test("le workflow expose la consultation deterministe du portefeuille", async () => {
  const workflow = await loadWorkflow();
  const webhook = workflow.nodes.find((node) => node.name === "Webhook - Portefeuille");
  const service = workflow.nodes.find((node) => node.name === "CRM - Consulter portefeuille");
  const formatter = workflow.nodes.find((node) => node.name === "Formater portefeuille");

  assert.equal(webhook.parameters.path, "crm/portefeuille");
  assert.match(service.parameters.query, /crm\.consulter_portefeuille/);
  assert.match(service.parameters.options.queryReplacement, /last_result_codes/);
  assert.match(service.parameters.options.queryReplacement, /scope === 'selection'/);
  assert.match(formatter.parameters.jsCode, /priority_score/);
  assert.ok(workflow.connections[webhook.name]);
});

test("le workflow expose l'enregistrement idempotent du dossier", async () => {
  const workflow = await loadWorkflow();
  const webhook = workflow.nodes.find((node) => node.name === "Webhook - Enregistrer dossier");
  const service = workflow.nodes.find((node) => node.name === "CRM - Enregistrer dossier");
  const response = workflow.nodes.find((node) =>
    String(node.name).includes("enregistrement dossier")
  );

  assert.equal(webhook.parameters.path, "crm/enregistrer-dossier");
  assert.match(service.parameters.query, /crm\.enregistrer_dossier_hypothecaire/);
  assert.match(service.parameters.options.queryReplacement, /request_id/);
  assert.match(response.parameters.responseBody, /dossier/);
  assert.ok(workflow.connections[webhook.name]);
});

test("le brouillon historique a identite fixe reste desactive", async () => {
  const legacyWorkflowUrl = new URL(
    "../../n8n-workflows/crm_agent_conversationnel_mvp.json",
    import.meta.url
  );
  const legacyWorkflow = JSON.parse(await readFile(legacyWorkflowUrl, "utf8"));
  assert.equal(legacyWorkflow.active, false);
  assert.match(legacyWorkflow.name, /ARCHIVE|NE PAS ACTIVER/i);
});

test("le workflow agenda initialise le contexte et sépare lecture et écriture", async () => {
  const agendaUrl = new URL("../../n8n-workflows/crm_agenda_mvp.json", import.meta.url);
  const workflow = JSON.parse(await readFile(agendaUrl, "utf8"));
  const webhooks = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.webhook");
  const postgresNodes = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.postgres");

  assert.deepEqual(webhooks.map((node) => node.parameters.path).sort(), [
    "crm/agenda", "crm/agenda/evenements", "crm/agenda/evenements/modifier"
  ]);
  assert.equal(postgresNodes.length, 3);
  for (const node of postgresNodes) {
    assert.match(node.parameters.query, /set_config\('app\.representant_id'/);
    assert.match(node.parameters.query, /crm\.(consulter_agenda|creer_evenement_agenda|modifier_evenement_agenda)/);
  }
});
