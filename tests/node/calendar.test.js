import assert from "node:assert/strict";
import test from "node:test";

import {
  createCalendarEvent,
  formatCalendarReply,
  getMissingCalendarFields,
  normalizeCalendarEvent,
  normalizeCalendarQuery,
  requestCalendarData,
  updateCalendarEvent
} from "../../src/calendar.js";

const REPRESENTATIVE_ID = "11111111-1111-4111-8111-111111111111";

test("la période et les filtres d’agenda sont normalisés", () => {
  const query = normalizeCalendarQuery({
    start: "2026-08-24T00:00:00-04:00",
    end: "2026-08-31T00:00:00-04:00",
    type: "RENCONTRE",
    remindersOnly: true,
    overdue: true,
    clientReference: " CLI-2026-AB-000001 "
  });
  assert.equal(query.filters.type, "rencontre");
  assert.equal(query.filters.rappels_seulement, true);
  assert.equal(query.filters.en_retard, true);
  assert.equal(query.filters.client_reference, "CLI-2026-AB-000001");
  assert.throws(() => normalizeCalendarQuery({ start: "2026-08-31", end: "2026-08-24" }), /période/i);
});

test("la création filtre les champs et prépare un rappel", () => {
  const event = normalizeCalendarEvent({
    title: "  Rencontre financement ",
    type: "rencontre",
    start: "2026-08-25T14:00:00-04:00",
    end: "2026-08-25T15:00:00-04:00",
    clientReference: "CLI-2026-AB-000001",
    reminderMinutes: 60,
    ignored: "ne doit pas sortir"
  });
  assert.equal(event.titre, "Rencontre financement");
  assert.equal(event.rappels[0].minutes_avant, 60);
  assert.equal(event.ignored, undefined);
});

test("la validation retourne tous les champs manquants utiles", () => {
  assert.deepEqual(getMissingCalendarFields({ type: "rencontre", stageCode: "prequalification" }), [
    "Titre",
    "Date et heure de début",
    "Date et heure de fin",
    "Client associé à l’étape du dossier"
  ]);
  assert.throws(
    () => normalizeCalendarEvent({ type: "rencontre", stageCode: "prequalification" }),
    /Champs à compléter.*Titre.*début.*fin.*Client/i
  );
});

test("la consultation transmet uniquement le contexte authentifié", async () => {
  let received;
  const result = await requestCalendarData({
    start: "2026-08-24T00:00:00-04:00",
    end: "2026-08-31T00:00:00-04:00"
  }, {
    representativeId: REPRESENTATIVE_ID,
    webhookUrl: "http://n8n.test/agenda",
    fetchImplementation: async (url, options) => {
      received = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ data: { nombre_evenements: 1, evenements: [{ titre: "Test" }] } }) };
    }
  });
  assert.equal(received.body.security_context.representant_id, REPRESENTATIVE_ID);
  assert.equal(result.count, 1);
  assert.equal(result.events[0].titre, "Test");
});

test("une réponse vide de l’orchestrateur produit une erreur métier explicite", async () => {
  await assert.rejects(
    () => createCalendarEvent({
      title: "Rencontre client",
      type: "rencontre",
      start: "2026-08-27T16:00:00Z",
      end: "2026-08-27T17:00:00Z"
    }, {
      representativeId: REPRESENTATIVE_ID,
      webhookUrl: "http://n8n.test/agenda/evenements",
      fetchImplementation: async () => ({ ok: true, text: async () => "" })
    }),
    /Vérifiez que le client appartient à votre portefeuille/
  );
});

test("la création est idempotente et liée au représentant", async () => {
  let received;
  const result = await createCalendarEvent({
    title: "Appel client",
    type: "appel",
    start: "2026-08-25T10:00:00-04:00",
    end: "2026-08-25T10:30:00-04:00",
    reminderEnabled: false
  }, {
    representativeId: REPRESENTATIVE_ID,
    requestId: "22222222-2222-4222-8222-222222222222",
    webhookUrl: "http://n8n.test/agenda/evenements",
    fetchImplementation: async (url, options) => {
      received = JSON.parse(options.body);
      return { ok: true, json: async () => ({ data: { code_evenement: "EVT-TEST" } }) };
    }
  });
  assert.equal(received.request_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(received.event.source, "manuel");
  assert.deepEqual(received.event.rappels, []);
  assert.equal(result.code_evenement, "EVT-TEST");
});

test("la modification conserve la frontière représentant et le code métier", async () => {
  let received;
  const result = await updateCalendarEvent("evt-123456789abc", {
    title: "Rencontre modifiée",
    type: "rencontre",
    start: "2026-08-25T10:00:00-04:00",
    end: "2026-08-25T11:00:00-04:00",
    clientReference: "CLI-2026-AB-000001",
    stageCode: "prequalification"
  }, {
    representativeId: REPRESENTATIVE_ID,
    webhookUrl: "http://n8n.test/agenda/evenements/modifier",
    fetchImplementation: async (_url, options) => {
      received = JSON.parse(options.body);
      return { ok: true, json: async () => ({ data: { code_evenement: "EVT-123456789ABC", statut: "modifie" } }) };
    }
  });
  assert.equal(received.action, "modifier");
  assert.equal(received.code_evenement, "EVT-123456789ABC");
  assert.equal(received.security_context.representant_id, REPRESENTATIVE_ID);
  assert.equal(result.statut, "modifie");
});

test("les réponses agenda sont factuelles et lisibles", () => {
  const reply = formatCalendarReply({ events: [{
    debut: "2026-08-25T14:00:00Z",
    titre: "Rencontre",
    nom_client: "Alice Roy",
    code_client: "CLI-2026-AR-000001",
    etape_titre: "Préqualification"
  }] });
  assert.match(reply, /Alice Roy/);
  assert.match(reply, /Préqualification/);

  const nextReply = formatCalendarReply({ events: [
    { debut: "2026-08-28T14:00:00Z", titre: "Prochaine rencontre" },
    { debut: "2026-08-29T14:00:00Z", titre: "Rencontre suivante" }
  ] }, { limit: 1 });
  assert.match(nextReply, /Prochaine rencontre/);
  assert.doesNotMatch(nextReply, /Rencontre suivante/);
});
