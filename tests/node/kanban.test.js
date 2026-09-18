import assert from "node:assert/strict";
import test from "node:test";
import {
  dossierDueDate,
  dossierNextAction,
  groupPortfolioByStage,
  kanbanStageForStatus,
  KANBAN_STAGES,
  requiresInterventionToday,
  torontoBusinessDate
} from "../../web/src/kanban.js";

test("les statuts existants sont projetés vers les neuf étapes stables", () => {
  assert.equal(KANBAN_STAGES.length, 9);
  assert.equal(kanbanStageForStatus("Nouveau"), "nouveaux");
  assert.equal(kanbanStageForStatus("Préqualification"), "a_qualifier");
  assert.equal(kanbanStageForStatus("Documents requis"), "documents");
  assert.equal(kanbanStageForStatus("En analyse"), "analyse");
  assert.equal(kanbanStageForStatus("Préapprouvé"), "pret_a_soumettre");
  assert.equal(kanbanStageForStatus("Soumis au prêteur"), "soumis");
  assert.equal(kanbanStageForStatus("Conditions à satisfaire"), "conditions");
  assert.equal(kanbanStageForStatus("Chez le notaire"), "finalisation");
  assert.equal(kanbanStageForStatus("Terminé"), "termine");
});

test("la journée métier suit Toronto plutôt que la date UTC", () => {
  assert.equal(torontoBusinessDate(new Date("2026-09-19T02:30:00Z")), "2026-09-18");
});

test("le regroupement conserve chaque dossier une seule fois", () => {
  const rows = [{ code_client: "A", statut_dossier: "Nouveau" }, { code_client: "B", statut_dossier: "En analyse" }];
  const groups = groupPortfolioByStage(rows);
  assert.deepEqual(groups.nouveaux.map((row) => row.code_client), ["A"]);
  assert.deepEqual(groups.analyse.map((row) => row.code_client), ["B"]);
  assert.equal(Object.values(groups).flat().length, rows.length);
});

test("la prochaine action, l'échéance et l'intervention du jour sont déterministes", () => {
  const row = { nombre_documents_manquants: 2, priority_score: 15, date_rappel: "2026-09-18" };
  assert.equal(dossierNextAction(row), "Obtenir 2 document(s) manquant(s)");
  assert.equal(dossierDueDate(row), "2026-09-18");
  assert.equal(requiresInterventionToday(row, "2026-09-18"), true);
  assert.equal(requiresInterventionToday({ priority_score: 0 }, "2026-09-18"), false);
});
