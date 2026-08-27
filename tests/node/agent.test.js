import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentRequestError,
  buildCalendarDraft,
  detectCalendarQuery,
  detectPortfolioQuery,
  extractClientDossier,
  extractExplicitClientReference,
  extractClientReferenceFromMessage,
  extractAgentReply,
  extractUniqueClientCode,
  formatClientDossierReply,
  formatClientInteractionSummaryReply,
  formatClientDocumentsReply,
  formatClientQueryReply,
  formatClientTasksReply,
  normalizeAgentRequest,
  normalizeClientReference,
  normalizeRepresentativeId,
  requestAgentReply,
  requestClientDossier,
  requestPortfolioData
} from "../../src/agent.js";
import {
  AGENT_SCHEMA_VERSION,
  buildAgentCommand,
  buildAgentResponse
} from "../../src/contracts.js";

const representativeId = "ac7b7a4b-907e-4733-a0de-4e5ed40e6af0";

test("les demandes d’agenda et de rappels sont interprétées sans LLM", () => {
  const now = new Date("2026-08-25T14:00:00-04:00");
  const tomorrow = detectCalendarQuery("Quelles rencontres ai-je demain?", now);
  assert.equal(tomorrow.period, "tomorrow");
  assert.equal(tomorrow.remindersOnly, false);

  const reminder = normalizeAgentRequest({ message: "Affiche mes rappels de la semaine" });
  assert.equal(reminder.intent, "consultation_rappels");
  assert.equal(reminder.calendar.period, "week");

  const agenda = normalizeAgentRequest({ message: "Qu’ai-je dans mon agenda aujourd’hui?" });
  assert.equal(agenda.intent, "consultation_agenda");
  assert.equal(agenda.interpretationSource, "deterministic");

  const overdue = normalizeAgentRequest({ message: "Quels rappels sont en retard?" });
  assert.equal(overdue.intent, "consultation_rappels");
  assert.equal(overdue.calendar.period, "overdue");
  assert.equal(overdue.calendar.overdue, true);

  const mutation = normalizeAgentRequest({ message: "Rappelle-moi d’appeler le client demain" });
  assert.equal(mutation.intent, "consultation_rappels");
  assert.equal(mutation.calendar.mutationRequested, true);
});

test("buildCalendarDraft prépare un rendez-vous à confirmer", () => {
  const now = new Date("2026-08-26T15:00:00Z");
  const input = normalizeAgentRequest({
    message: "Planifie un rendez-vous demain à 14h30",
    context: { activeClient: "CLI-2026-KP-000010" }
  }, { now });
  const draft = buildCalendarDraft(input, now);

  assert.equal(draft.clientReference, "CLI-2026-KP-000010");
  assert.equal(draft.type, "rencontre");
  assert.equal(draft.start, "2026-08-27T18:30:00.000Z");
  assert.equal(draft.end, "2026-08-27T19:30:00.000Z");
  assert.equal(draft.source, "assistant");
});

test("buildCalendarDraft accepte une heure sans minutes", () => {
  const now = new Date("2026-08-26T15:00:00Z");
  const input = normalizeAgentRequest(
    { message: "Planifie un appel demain à 9h" },
    { now }
  );
  const draft = buildCalendarDraft(input, now);

  assert.equal(draft.type, "appel");
  assert.equal(draft.start, "2026-08-27T13:00:00.000Z");
});

test("les périodes d’agenda suivent Toronto indépendamment du fuseau du serveur", () => {
  const now = new Date("2026-08-26T02:00:00.000Z");
  const today = detectCalendarQuery("Montre mon agenda aujourd’hui", now);
  const overdue = detectCalendarQuery("Quels rappels sont en retard?", now);

  assert.equal(today.start, "2026-08-25T04:00:00.000Z");
  assert.equal(today.end, "2026-08-26T04:00:00.000Z");
  assert.equal(overdue.end, now.toISOString());
});

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
  const input = normalizeAgentRequest({ message: "  Bonjour  ", sessionId: "session-demo" });
  assert.equal(input.message, "Bonjour");
  assert.equal(input.sessionId, "session-demo");
  assert.equal(input.intent, "conversation");
  assert.equal(input.interpretationSource, "ai_fallback");
  assert.match(input.requestId, /^[0-9a-f-]{36}$/i);
});

test("normalizeAgentRequest accepte uniquement une intention structurée connue", () => {
  const input = normalizeAgentRequest({
    message: "Derniers clients",
    sessionId: "session-demo",
    intent: "clients_recents"
  });
  assert.equal(input.intent, "clients_recents");
  assert.equal(input.interpretationSource, "explicit");
  assert.equal(input.confidence, 1);

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

test("normalizeAgentRequest reconnaît le résumé d’une visite dans le dossier actif", () => {
  const input = normalizeAgentRequest({
    message: "Résume ma dernière visite",
    context: { activeClient: "CLI-2026-KP-000010" }
  });

  assert.equal(input.intent, "resume_interaction_client");
  assert.equal(input.clientReference, "CLI-2026-KP-000010");
  assert.equal(input.clarificationRequired, false);
});

test("normalizeAgentRequest demande le client pour un résumé de visite sans contexte", () => {
  const input = normalizeAgentRequest({ message: "Fais-moi un résumé de la visite" });

  assert.equal(input.intent, "resume_interaction_client");
  assert.equal(input.clientReference, null);
  assert.equal(input.clarificationRequired, true);
});

test("normalizeAgentRequest reconnaît un dossier individuel avec un nom en minuscules", () => {
  const input = normalizeAgentRequest({
    message: "affiche le dossier de karine pelletier"
  });

  assert.equal(input.intent, "dossier_client");
  assert.equal(input.clientReference, "karine pelletier");
  assert.equal(input.scope, "single_client");
  assert.equal(input.clarificationRequired, false);

  const portfolio = normalizeAgentRequest({ message: "affiche tous les dossiers" });
  assert.equal(portfolio.intent, "consultation_portefeuille");
  assert.equal(portfolio.clientReference, null);
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
  assert.equal(
    normalizeAgentRequest({ message: "Quels suivis sont ouverts pour Chloé Simard ?" }).intent,
    "taches_client"
  );
});

test("normalizeAgentRequest conserve les questions générales sur le suivi hypothécaire", () => {
  assert.equal(
    normalizeAgentRequest({
      message: "Explique-moi ce que tu peux faire pour le suivi hypothécaire."
    }).intent,
    "conversation"
  );
});

test("normalizeAgentRequest distingue le portefeuille des documents d’un client", () => {
  const portfolio = normalizeAgentRequest({
    message: "Quel client a des documents manquants?",
    context: { activeClient: "CLI-2026-PL-000013" }
  });
  const client = normalizeAgentRequest({
    message: "Quel document manque pour Philippe Lavoie?"
  });

  assert.equal(portfolio.intent, "clients_documents_manquants");
  assert.equal(portfolio.clientReference, null);
  assert.equal(portfolio.clarificationRequired, false);
  assert.equal(client.intent, "documents_client");
});

test("normalizeAgentRequest résout une référence anaphorique avec le contexte actif", () => {
  const input = normalizeAgentRequest({
    message: "Et ses papiers manquants?",
    sessionId: "session-contexte",
    context: { activeClient: "CLI-2026-OB-000012" }
  });

  assert.equal(input.intent, "documents_client");
  assert.equal(input.clientReference, "CLI-2026-OB-000012");
  assert.equal(input.clarificationRequired, false);
});

test("normalizeAgentRequest exige une clarification pour une demande sans client", () => {
  const input = normalizeAgentRequest({ message: "Quels documents manquants?" });
  assert.equal(input.intent, "documents_client");
  assert.equal(input.clientReference, null);
  assert.equal(input.clarificationRequired, true);
});

test("la première tranche des formulations métier produit une consultation structurée", () => {
  const questions = [
    "Quel est l'état du dossier de Benoît Tremblay ?",
    "Est-ce que le dossier de Benoît Tremblay avance bien ?",
    "Où en est rendue la demande de M. Tremblay ?",
    "Peux-tu me donner le suivi du fichier de Benoît Tremblay ?",
    "A-t-on des nouvelles de la demande de Benoît Tremblay ?",
    "Quel est le salaire confirmé de Benoît Tremblay ?",
    "Combien gagne M. Tremblay selon les documents au dossier ?",
    "Peux-tu me donner le revenu brut de Benoît Tremblay ?",
    "Quel est le revenu retenu pour la qualification de Benoît Tremblay ?",
    "Est-ce qu'on a validé la paye de M. Tremblay et à combien elle s'élève ?",
    "De combien est la mise de fonds de Benoît Tremblay ?",
    "Quelle est la provenance de la mise de fonds du client Tremblay ?",
    "As-tu le montant de l'acompte prévu par Benoît Tremblay ?",
    "Est-ce que la preuve de mise de fonds de M. Tremblay est au dossier ?",
    "Quel montant le client Tremblay met-il en comptant ?",
    "Quel est le numéro de téléphone de Benoît Tremblay ?",
    "Comment joindre M. Tremblay ?",
    "Peux-tu me donner le courriel et le téléphone de Benoît Tremblay ?",
    "As-tu les coordonnées de contact pour le dossier Tremblay ?",
    "Donne-moi le numéro mobile de M. Tremblay.",
    "Quel est le montant de l'hypothèque demandée par Benoît Tremblay ?",
    "Combien le client Tremblay emprunte-t-il au total ?",
    "Quel est le solde du prêt financé pour M. Tremblay ?",
    "De quel montant est le financement pour Benoît Tremblay ?",
    "As-tu le montant net du prêt hypothécaire de M. Tremblay ?"
  ];

  for (const message of questions) {
    const input = normalizeAgentRequest({ message });
    assert.equal(input.intent, "consultation_client", message);
    assert.ok(input.clientReference, message);
    assert.ok(input.requestedFields.length > 0, message);
    assert.equal(input.clarificationRequired, false, message);
  }
});

test("la résolution d'entité donne priorité au nom explicite sur les pronoms", () => {
  const message = "Le dossier de Benoît Tremblay est-il complet au niveau des pièces ?";
  const input = normalizeAgentRequest({ message });

  assert.equal(extractExplicitClientReference(message), "Benoît Tremblay");
  assert.equal(input.clientReference, "Benoît Tremblay");
  assert.equal(input.clarificationRequired, false);
});

test("une demande de documents d'un dossier ne devient pas une recherche portefeuille", () => {
  const input = normalizeAgentRequest({
    message: "Quels sont les documents manquants pour le dossier Tremblay ?"
  });

  assert.equal(input.intent, "documents_client");
  assert.equal(input.clientReference, "Tremblay");
});

test("formatClientQueryReply ne retourne que les champs demandés", () => {
  const reply = formatClientQueryReply({
    trouve: true,
    ambigue: false,
    dossier: {
      nom_client: "Olivier Bergeron",
      code_client: "CLI-2026-OB-000015",
      statut_dossier: "En analyse",
      revenu_annuel: 92000,
      telephone: "514-555-0101"
    }
  }, ["revenu_annuel"]);

  assert.match(reply, /92[\s ]000 \$/);
  assert.doesNotMatch(reply, /En analyse/);
  assert.doesNotMatch(reply, /514-555/);
});

test("les domaines hypothécaires spécialisés sont routés sans modèle", () => {
  const questions = [
    "Est-ce que le prêt de Benoît Tremblay a été approuvé ?",
    "Quel est le notaire assigné au dossier de Benoît Tremblay ?",
    "Quelle banque a été sélectionnée pour Benoît Tremblay ?",
    "Quel est le taux d'intérêt obtenu pour Benoît Tremblay ?",
    "Quelle est la date de prise de possession pour Benoît Tremblay ?",
    "Où en est le rapport d'évaluation pour le dossier de Benoît Tremblay ?",
    "Est-ce que le dossier de Benoît Tremblay est assuré par la SCHL ?"
  ];

  for (const message of questions) {
    const input = normalizeAgentRequest({ message });
    assert.equal(input.intent, "consultation_client", message);
    assert.equal(input.clientReference, "Benoît Tremblay", message);
    assert.ok(input.requestedFields.length > 0, message);
  }
});

test("formatClientQueryReply formate les détails hypothécaires imbriqués", () => {
  const reply = formatClientQueryReply({
    trouve: true,
    ambigue: false,
    dossier: {
      nom_client: "Benoît Tremblay",
      code_client: "CLI-2026-BT-000060",
      details_hypothecaires: {
        preteur: "Banque Nationale",
        taux_interet: "4.7900",
        type_taux: "Fixe",
        terme_mois: 60,
        date_approbation: "2026-08-12"
      }
    }
  }, ["preteur", "taux_interet", "type_taux", "terme_mois", "date_approbation"]);

  assert.match(reply, /Banque Nationale/);
  assert.match(reply, /4\.7900 %/);
  assert.match(reply, /60 mois \(5 ans\)/);
  assert.match(reply, /12 août 2026/);
});

test("requestAgentReply clarifie sans appeler n8n lorsque le client manque", async () => {
  const input = normalizeAgentRequest({ message: "Et ses tâches?" });
  let called = false;
  const reply = await requestAgentReply(
    { ...input, representativeId },
    {
      fetchImplementation: async () => {
        called = true;
        throw new Error("appel inattendu");
      }
    }
  );

  assert.equal(called, false);
  assert.match(reply, /quel client/i);
});

test("les contrats agent sont versionnés et séparent le contexte de sécurité", () => {
  const input = normalizeAgentRequest({
    message: "Bonjour",
    sessionId: "session-contrat",
    requestId: "11111111-1111-4111-8111-111111111111"
  });
  const command = buildAgentCommand(input, representativeId);
  const response = buildAgentResponse(input, "Bonjour!", {});

  assert.equal(command.schema_version, AGENT_SCHEMA_VERSION);
  assert.equal(command.security_context.representant_id, representativeId);
  assert.equal(command.conversation_context.active_client, null);
  assert.deepEqual(command.parameters.requested_fields, []);
  assert.equal(command.parameters.scope, "single_client");
  assert.equal(response.status, "success");
  assert.equal(response.reply, "Bonjour!");
  assert.equal(response.error, null);
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
  const receivedBody = JSON.parse(receivedRequest.request.body);
  assert.equal(receivedBody.schema_version, AGENT_SCHEMA_VERSION);
  assert.equal(receivedBody.message, "Documents Olivier");
  assert.equal(receivedBody.session_id, "session-test");
  assert.equal(receivedBody.intent, "conversation");
  assert.equal(receivedBody.representant_id, representativeId);
  assert.equal(receivedBody.command.security_context.representant_id, representativeId);
  assert.equal(receivedBody.security_context.representant_id, representativeId);
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
  assert.equal(receivedBody.message, "Affiche les derniers clients");
  assert.equal(receivedBody.session_id, "session-intent");
  assert.equal(receivedBody.intent, "clients_recents");
  assert.equal(receivedBody.representant_id, representativeId);
  assert.equal(receivedBody.command.intent, "clients_recents");
});

test("requestAgentReply route les documents manquants du portefeuille", async () => {
  let receivedUrl;
  let receivedBody;
  const input = normalizeAgentRequest({
    message: "Quels clients ont des documents en attente?",
    sessionId: "session-documents-manquants"
  });

  const reply = await requestAgentReply(
    { ...input, representativeId },
    {
      webhookUrl: "http://n8n.test/conversation",
      missingDocumentsWebhookUrl: "http://n8n.test/documents-manquants",
      fetchImplementation: async (url, request) => {
        receivedUrl = url;
        receivedBody = JSON.parse(request.body);
        return {
          ok: true,
          async json() {
            return { reply: "Deux clients ont des documents manquants." };
          }
        };
      }
    }
  );

  assert.equal(receivedUrl, "http://n8n.test/documents-manquants");
  assert.equal(receivedBody.intent, "clients_documents_manquants");
  assert.equal(reply, "Deux clients ont des documents manquants.");
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

test("formatClientInteractionSummaryReply retourne la dernière interaction enregistrée", () => {
  const reply = formatClientInteractionSummaryReply({
    trouve: true,
    dossier: {
      nom_client: "Karine Pelletier",
      code_client: "CLI-2026-KP-000010",
      derniere_interaction: {
        date_appel: "2026-08-20T14:30:00-04:00",
        type_interaction: "Visite",
        resume: "Le client souhaite refinancer et transmettra ses relevés bancaires."
      }
    }
  });

  assert.match(reply, /Dernière interaction pour Karine Pelletier/);
  assert.match(reply, /Type : Visite/);
  assert.match(reply, /souhaite refinancer/);
});

test("formatClientInteractionSummaryReply explique quand aucun résumé n’existe", () => {
  const reply = formatClientInteractionSummaryReply({
    trouve: true,
    dossier: {
      nom_client: "Karine Pelletier",
      code_client: "CLI-2026-KP-000010",
      derniere_interaction: null
    }
  });

  assert.match(reply, /Aucune visite ou interaction n’est enregistrée/);
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

test("les consultations globales sont routees vers le portefeuille", () => {
  const cases = [
    ["Afficher tous les dossiers", {}],
    ["Quels clients ont un dossier en analyse ?", { statut: "En analyse" }],
    ["Quel est mon client au plus gros revenu ?", {}],
    ["Liste de tous les clients à relancer", { a_relancer: true }],
    ["affiche les dossier en retard", { a_relancer: true }],
    ["affiche les dossiers préapprouvés", { statut: "Préapprouvé" }],
    ["montre moi les dossier en analyse", { statut: "En analyse" }]
  ];

  for (const [message, filters] of cases) {
    const input = normalizeAgentRequest({ message });
    assert.equal(input.intent, "consultation_portefeuille", message);
    assert.equal(input.scope, "portfolio", message);
    assert.deepEqual(input.portfolio.filters, filters, message);
  }
});

test("une nouvelle recherche globale ignore le dernier dossier consulte", () => {
  const context = {
    activeClient: "CLI-2026-LC-000011",
    lastResultCodes: ["CLI-2026-LC-000011"]
  };

  for (const message of [
    "affiche les dossier en retard",
    "affiche les dossiers préapprouvés",
    "montre moi les dossier en analyse"
  ]) {
    const input = normalizeAgentRequest({ message, context });
    const command = buildAgentCommand(input, representativeId);

    assert.equal(input.intent, "consultation_portefeuille", message);
    assert.equal(input.scope, "portfolio", message);
    assert.deepEqual(input.portfolio.selectionCodes, [], message);
    assert.deepEqual(command.conversation_context.last_result_codes, [], message);
  }
});

test("les dossiers en retard sont tries par priorite", () => {
  const input = normalizeAgentRequest({ message: "affiche les dossier en retard" });

  assert.deepEqual(input.portfolio.filters, { a_relancer: true });
  assert.deepEqual(input.portfolio.sort, [
    { field: "priority_score", direction: "desc" }
  ]);
});

test("une relance contextuelle reutilise les codes valides du dernier resultat", () => {
  const input = normalizeAgentRequest({
    message: "Classe-les en ordre de traitement dans un tableau",
    context: {
      lastResultCodes: [
        "CLI-2026-OB-000015",
        "invalide",
        "CLI-2026-CS-000014",
        "CLI-2026-OB-000015"
      ]
    }
  });

  assert.equal(input.intent, "consultation_portefeuille");
  assert.equal(input.scope, "selection");
  assert.deepEqual(input.portfolio.selectionCodes, [
    "CLI-2026-OB-000015",
    "CLI-2026-CS-000014"
  ]);
  assert.deepEqual(
    buildAgentCommand(input, representativeId).conversation_context.last_result_codes,
    ["CLI-2026-OB-000015", "CLI-2026-CS-000014"]
  );
  assert.deepEqual(input.portfolio.sort, [{ field: "priority_score", direction: "desc" }]);
  assert.equal(input.portfolio.format, "table");
});

test("detectPortfolioQuery structure l'agregation du revenu", () => {
  assert.deepEqual(
    detectPortfolioQuery("Quel client gagne le plus ?")?.aggregate,
    { operation: "max", field: "revenu_annuel" }
  );
});

test("requestAgentReply route le portefeuille vers le webhook dedie", async () => {
  const input = normalizeAgentRequest({ message: "Afficher tous les dossiers" });
  let received;
  const reply = await requestAgentReply(
    { ...input, representativeId },
    {
      portfolioWebhookUrl: "http://n8n.test/portefeuille",
      fetchImplementation: async (url, request) => {
        received = { url, body: JSON.parse(request.body) };
        return { ok: true, async json() { return { reply: "Deux dossiers." }; } };
      }
    }
  );

  assert.equal(reply, "Deux dossiers.");
  assert.equal(received.url, "http://n8n.test/portefeuille");
  assert.equal(received.body.command.parameters.scope, "portfolio");
  assert.equal(received.body.command.parameters.limit, 20);
});

test("requestPortfolioData retourne un contrat structuré et filtré", async () => {
  let receivedBody;
  const result = await requestPortfolioData({
    status: "En analyse",
    followUp: true,
    limit: 250,
    // Une valeur injectee par le navigateur ne doit jamais remplacer
    // l'identite verifiee extraite du JWT.
    representativeId: "00000000-0000-4000-8000-000000000099",
    representant_id: "00000000-0000-4000-8000-000000000098",
    sort: [{ field: "priority_score", direction: "desc" }]
  }, {
    webhookUrl: "http://n8n.test/portfolio",
    representativeId,
    fetchImplementation: async (_url, options) => {
      receivedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          data: {
            nombre_clients: 1,
            rows: [{ code_client: "CLI-2026-AB-000001", nom_client: "Alice B" }]
          }
        })
      };
    }
  });
  assert.equal(result.count, 1);
  assert.equal(result.rows[0].nom_client, "Alice B");
  assert.equal(receivedBody.command.parameters.limit, 100);
  assert.deepEqual(receivedBody.command.parameters.filters, {
    statut: "En analyse",
    a_relancer: true
  });
  assert.equal(receivedBody.security_context.representant_id, representativeId);
  assert.equal(receivedBody.representant_id, representativeId);
  assert.equal(receivedBody.command.security_context.representant_id, representativeId);
});

test("les informations personnelles et le projet sont consultables sans LLM", () => {
  const questions = [
    ["Quelle est l'adresse de Benoît Tremblay ?", "adresse"],
    ["Quelle est la date de naissance de Benoît Tremblay ?", "date_naissance"],
    ["Qui est le codemandeur de Benoît Tremblay ?", "participants"],
    ["Quel est le type de propriété de Benoît Tremblay ?", "type_propriete"],
    ["Les consentements de Benoît Tremblay sont-ils acceptés ?", "consentements"]
  ];

  for (const [message, field] of questions) {
    const input = normalizeAgentRequest({ message });
    assert.equal(input.intent, "consultation_client", message);
    assert.ok(input.requestedFields.includes(field), message);
  }
});

test("la durée du statut en analyse est expliquée avec son délai cible", () => {
  const input = normalizeAgentRequest({ message: "Depuis quand le dossier de Karine Pelletier est en analyse et le délai est-il dépassé ?" });
  assert.equal(input.intent, "consultation_client");
  assert.ok(input.requestedFields.includes("statut_depuis"));

  const reply = formatClientQueryReply({
    trouve: true,
    dossier: {
      nom_client: "Karine Pelletier",
      code_client: "CLI-2026-KP-000010",
      statut_dossier: "En analyse",
      statut_depuis: "2026-08-18T10:00:00Z",
      jours_dans_statut: 8
    }
  }, input.requestedFields);

  assert.match(reply, /Durée dans le statut : 8 jour/);
  assert.match(reply, /Délai cible d’analyse : 5 jours calendaires/);
  assert.match(reply, /Délai dépassé : oui, de 3 jour/);
});

test("formatClientQueryReply formate le profil, les participants et le projet", () => {
  const reply = formatClientQueryReply({
    trouve: true,
    dossier: {
      nom_client: "Bernard Exemple",
      code_client: "CLI-2026-BE-000099",
      profil_client: {
        date_naissance: "1980-11-13",
        adresse: { numero_civique: "2428", rue: "Sainte-Foy", ville: "Québec", code_postal: "G1X 1W3" }
      },
      projet_hypothecaire: { type_propriete: "Jumelée", echeancier_projet: "Dans les 6 prochains mois" },
      participants: [{ prenom: "Bernadette", nom: "Exemple", role: "Codemandeur" }],
      consentements: [{ type: "Recherche de crédit", accepte: true }]
    }
  }, ["date_naissance", "adresse", "type_propriete", "echeancier_projet", "participants", "consentements"]);

  assert.match(reply, /13 novembre 1980/);
  assert.match(reply, /2428 Sainte-Foy/);
  assert.match(reply, /Jumelée/);
  assert.match(reply, /Bernadette Exemple/);
  assert.match(reply, /Recherche de crédit \(accepté\)/);
});
