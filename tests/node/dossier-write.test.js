import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDossierUpdate, requestDossierUpdate } from "../../src/dossier-write.js";

const REPRESENTATIVE_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

test("la sauvegarde exige une confirmation explicite", () => {
  assert.throws(() => normalizeDossierUpdate({}), /confirmation/i);
});

test("la sauvegarde normalise et filtre les champs CRM", () => {
  const result = normalizeDossierUpdate({
    confirmed: true,
    requestId: REQUEST_ID,
    ignored: "secret",
    profil_client: {
      prenom: "  Alice ", nom: " Tremblay ", courriel: "ALICE@EXAMPLE.CA",
      telephone: "+1 514 555-0101", adresse: { code_postal: "h2x 1y4" }
    },
    projet_hypothecaire: { prix_achat: "425000", statut_soumission: "Brouillon" },
    participants: [{ role: "Codemandeur", prenom: "Marc", nom: "Roy" }]
  });

  assert.equal(result.requestId, REQUEST_ID);
  assert.equal(result.payload.profil_client.prenom, "Alice");
  assert.equal(result.payload.profil_client.courriel, "alice@example.ca");
  assert.equal(result.payload.profil_client.adresse.code_postal, "H2X 1Y4");
  assert.equal(result.payload.projet_hypothecaire.prix_achat, 425000);
  assert.equal(result.payload.ignored, undefined);
});

test("la validation bloque les coordonnées et montants invalides", () => {
  assert.throws(() => normalizeDossierUpdate({
    confirmed: true,
    profil_client: { courriel: "invalide" }
  }), /courriel/i);
  assert.throws(() => normalizeDossierUpdate({
    confirmed: true,
    projet_hypothecaire: { montant_requis: -1 }
  }), /montant/i);
});

test("le transport transmet le représentant authentifié et le contrat filtré", async () => {
  let received;
  const input = normalizeDossierUpdate({
    confirmed: true,
    requestId: REQUEST_ID,
    profil_client: { prenom: "Alice", nom: "Tremblay" }
  });
  const result = await requestDossierUpdate("cli-2026-at-000001", input, {
    representativeId: REPRESENTATIVE_ID,
    webhookUrl: "http://n8n.test/save",
    fetchImplementation: async (url, options) => {
      received = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ dossier: { trouve: true, dossier: { code_client: "CLI-2026-AT-000001" } } }) };
    }
  });

  assert.equal(received.url, "http://n8n.test/save");
  assert.equal(received.options.method, "POST");
  assert.equal(received.body.representant_id, REPRESENTATIVE_ID);
  assert.equal(received.body.security_context.representant_id, REPRESENTATIVE_ID);
  assert.equal(received.body.client_reference, "CLI-2026-AT-000001");
  assert.equal(received.body.request_id, REQUEST_ID);
  assert.deepEqual(result, { trouve: true, dossier: { code_client: "CLI-2026-AT-000001" } });
});
