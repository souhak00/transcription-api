import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentRequestError,
  extractClientDossier,
  extractClientReferenceFromMessage,
  extractAgentReply,
  extractUniqueClientCode,
  formatClientDossierReply,
  formatClientDocumentsReply,
  formatClientTasksReply,
  normalizeAgentRequest,
  normalizeClientReference,
  normalizeRepresentativeId,
  requestAgentReply,
  requestClientDossier
} from "../../src/agent.js";

const representativeId = "ac7b7a4b-907e-4733-a0de-4e5ed40e6af0";

test("extractUniqueClientCode sélectionne uniquement un client non ambigu", () => {
  assert.equal(
    extractUniqueClientCode(
      "Quels documents manquent pour Chloé Simard ?",
      "Documents de Chloé Simard — CLI-2026-CS-000014"
    ),
    "CLI-2026-CS-000014"
  );
  assert.equal(
    extractUniqueClientCode(
      "1. Olivier — CLI-2026-OB-000015",
      "2. Chloé — CLI-2026-CS-000014"
    ),
    null
  );
  assert.equal(extractUniqueClientCode("Aucun client trouvé."), null);
});

test("normalizeAgentRequest nettoie le message et conserve la session", () => {
  assert.deepEqual(
    normalizeAgentRequest({ message: "  Bonjour  ", sessionId: "session-demo" }),
    { message: "Bonjour", sessionId: "session-demo", intent: "conversation" }
  );
});

test("normalizeAgentRequest accepte uniquement une intention structurée connue", () => {
  assert.deepEqual(
    normalizeAgentRequest({
      message: "Derniers clients",
      sessionId: "session-demo",
      intent: "clients_recents"
    }),
    {
      message: "Derniers clients",
      sessionId: "session-demo",
      intent: "clients_recents"
    }
  );

  assert.throws(
    () => normalizeAgentRequest({ message: "Test", intent: "sql_libre" }),
    (error) => error instanceof AgentRequestError && error.statusCode === 400
  );
});

test("normalizeAgentRequest détecte une demande d’affichage de dossier", () => {
  assert.equal(
    normalizeAgentRequest({ message: "Afficher le dossier CLI-2026-KP-000010" }).intent,
    "dossier_client"
  );
});

test("normalizeAgentRequest route les documents et les tâches sans dépendre du LLM", () => {
  assert.equal(
    normalizeAgentRequest({ message: "Quels documents manquent pour Chloé Simard ?" }).intent,
    "documents_client"
  );
  assert.equal(
    normalizeAgentRequest({ message: "Quelles sont les tâches ouvertes pour Chloé Simard ?" }).intent,
    "taches_client"
  );
});

test("les réponses déterministes gèrent les collections vides", () => {
  const result = {
    trouve: true,
    dossier: {
      nom_client: "Chloé Simard",
      code_client: "CLI-2026-CS-000014",
      documents: [{ document: "Preuve de mise de fonds", statut: "À recevoir" }],
      taches: []
    }
  };

  assert.match(formatClientDocumentsReply(result), /Preuve de mise de fonds/);
  assert.equal(
    formatClientTasksReply(result),
    "Aucune tâche ouverte pour Chloé Simard — CLI-2026-CS-000014."
  );
});

test("normalizeAgentRequest refuse un message vide", () => {
  assert.throws(
    () => normalizeAgentRequest({ message: "   " }),
    (error) => error instanceof AgentRequestError && error.statusCode === 400
  );
});

test("extractAgentReply accepte le contrat n8n", () => {
  assert.equal(extractAgentReply({ reponse: "Dossier trouvé." }), "Dossier trouvé.");
  assert.equal(extractAgentReply([{ output: "Une tâche ouverte." }]), "Une tâche ouverte.");
});

test("requestAgentReply transmet seulement le contrat minimal", async () => {
  let receivedRequest;
  const reply = await requestAgentReply(
    { message: "Documents Olivier", sessionId: "session-test", representativeId },
    {
      webhookUrl: "http://n8n.test/webhook",
      fetchImplementation: async (url, request) => {
        receivedRequest = { url, request };
        return {
          ok: true,
          async json() {
            return { reponse: "Deux documents manquants." };
          }
        };
      }
    }
  );

  assert.equal(reply, "Deux documents manquants.");
  assert.equal(receivedRequest.url, "http://n8n.test/webhook");
  assert.deepEqual(JSON.parse(receivedRequest.request.body), {
    message: "Documents Olivier",
    session_id: "session-test",
    intent: "conversation",
    representant_id: representativeId
  });
});

test("requestAgentReply transmet l’intention structurée autorisée", async () => {
  let receivedBody;
  let receivedUrl;
  await requestAgentReply(
    {
      message: "Affiche les derniers clients",
      sessionId: "session-intent",
      intent: "clients_recents",
      representativeId
    },
    {
      webhookUrl: "http://n8n.test/webhook",
      recentClientsWebhookUrl: "http://n8n.test/clients-recents",
      fetchImplementation: async (url, request) => {
        receivedUrl = url;
        receivedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return { reponse: "Liste disponible." };
          }
        };
      }
    }
  );

  assert.equal(receivedUrl, "http://n8n.test/clients-recents");
  assert.deepEqual(receivedBody, {
    message: "Affiche les derniers clients",
    session_id: "session-intent",
    intent: "clients_recents",
    representant_id: representativeId
  });
});

test("normalizeClientReference valide le code ou le nom du client", () => {
  assert.equal(normalizeClientReference("  CLI-2026-OB-000015  "), "CLI-2026-OB-000015");
  assert.throws(
    () => normalizeClientReference("   "),
    (error) => error instanceof AgentRequestError && error.statusCode === 400
  );
});

test("normalizeRepresentativeId refuse une identité fournie hors du jeton", () => {
  assert.equal(normalizeRepresentativeId(representativeId), representativeId);
  assert.throws(
    () => normalizeRepresentativeId("representant-mvp"),
    (error) => error instanceof AgentRequestError && error.statusCode === 403
  );
});

test("extractClientDossier accepte le contrat n8n structuré", () => {
  const dossier = { trouve: true, dossier: { code_client: "CLI-2026-OB-000015" } };
  assert.deepEqual(extractClientDossier({ dossier }), dossier);
});

test("requestClientDossier transmet seulement la référence métier", async () => {
  let receivedBody;
  const dossier = await requestClientDossier("Olivier Bergeron", {
    webhookUrl: "http://n8n.test/dossier-client",
    representativeId,
    fetchImplementation: async (_url, request) => {
      receivedBody = JSON.parse(request.body);
      return {
        ok: true,
        async json() {
          return { dossier: { trouve: true, dossier: { nom_client: "Olivier Bergeron" } } };
        }
      };
    }
  });

  assert.deepEqual(receivedBody, {
    client_reference: "Olivier Bergeron",
    representant_id: representativeId
  });
  assert.equal(dossier.dossier.nom_client, "Olivier Bergeron");
});

test("extractClientReferenceFromMessage isole le code client", () => {
  assert.equal(
    extractClientReferenceFromMessage("afficher le dossier cli-2026-kp-000010"),
    "CLI-2026-KP-000010"
  );
});

test("formatClientDossierReply produit une réponse stable", () => {
  const reply = formatClientDossierReply({
    trouve: true,
    ambigue: false,
    dossier: {
      nom_client: "Karine Pelletier",
      code_client: "CLI-2026-KP-000010",
      statut_dossier: "Documents requis",
      type_transaction: "Refinancement",
      type_emploi: "Salariée",
      employeur: "École du Fleuve",
      documents: [],
      taches: [],
      resume_dossier: {
        nombre_interactions: 0,
        nombre_documents_manquants: 0,
        nombre_taches_ouvertes: 0
      },
      prochaine_action: null
    }
  });

  assert.match(reply, /Karine Pelletier/);
  assert.match(reply, /Documents requis/);
  assert.match(reply, /Prochaine action : Aucune action planifiée/);
});

test("requestAgentReply route le dossier sans dépendre du choix du modèle", async () => {
  let receivedUrl;
  const reply = await requestAgentReply(
    {
      message: "Afficher le dossier CLI-2026-KP-000010",
      sessionId: "session-dossier",
      intent: "dossier_client",
      representativeId
    },
    {
      clientDossierWebhookUrl: "http://n8n.test/dossier-client",
      fetchImplementation: async (url) => {
        receivedUrl = url;
        return {
          ok: true,
          async json() {
            return {
              dossier: {
                trouve: true,
                dossier: {
                  nom_client: "Karine Pelletier",
                  code_client: "CLI-2026-KP-000010",
                  statut_dossier: "Documents requis",
                  documents: [],
                  taches: [],
                  resume_dossier: {}
                }
              }
            };
          }
        };
      }
    }
  );

  assert.equal(receivedUrl, "http://n8n.test/dossier-client");
  assert.match(reply, /Karine Pelletier/);
});

test("requestAgentReply route une liste de tâches vide vers le service dossier", async () => {
  let receivedUrl;
  const reply = await requestAgentReply(
    {
      message: "Quelles sont les tâches ouvertes pour CLI-2026-CS-000014 ?",
      sessionId: "session-taches",
      intent: "taches_client",
      representativeId
    },
    {
      clientDossierWebhookUrl: "http://n8n.test/dossier-client",
      fetchImplementation: async (url) => {
        receivedUrl = url;
        return {
          ok: true,
          async json() {
            return {
              dossier: {
                trouve: true,
                dossier: {
                  nom_client: "Chloé Simard",
                  code_client: "CLI-2026-CS-000014",
                  documents: [],
                  taches: []
                }
              }
            };
          }
        };
      }
    }
  );

  assert.equal(receivedUrl, "http://n8n.test/dossier-client");
  assert.equal(reply, "Aucune tâche ouverte pour Chloé Simard — CLI-2026-CS-000014.");
});
