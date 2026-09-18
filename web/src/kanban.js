const accents = /[\u0300-\u036f]/g;

export const KANBAN_STAGES = Object.freeze([
  { id: "nouveaux", label: "Nouveaux" },
  { id: "a_qualifier", label: "À qualifier" },
  { id: "documents", label: "Documents" },
  { id: "analyse", label: "Analyse" },
  { id: "pret_a_soumettre", label: "Prêt à soumettre" },
  { id: "soumis", label: "Soumis" },
  { id: "conditions", label: "Conditions" },
  { id: "finalisation", label: "Finalisation" },
  { id: "termine", label: "Terminé" }
]);

function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(accents, "").trim().toLowerCase();
}

export function torontoBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function kanbanStageForStatus(status) {
  const value = normalized(status);
  if (/termine|ferme|finance|complete/.test(value)) return "termine";
  if (/finalisation|notaire|signature/.test(value)) return "finalisation";
  if (/condition/.test(value)) return "conditions";
  if (/soumis|soumission/.test(value)) return "soumis";
  if (/pret a soumettre|preapprouve/.test(value)) return "pret_a_soumettre";
  if (/analyse/.test(value)) return "analyse";
  if (/document/.test(value)) return "documents";
  if (/qualif/.test(value)) return "a_qualifier";
  return "nouveaux";
}

export function groupPortfolioByStage(rows = []) {
  const groups = Object.fromEntries(KANBAN_STAGES.map((stage) => [stage.id, []]));
  for (const row of rows) groups[kanbanStageForStatus(row?.statut_dossier)].push(row);
  return groups;
}

export function dossierDueDate(row = {}) {
  return String(row.prochaine_action?.date_echeance ?? row.date_echeance ?? row.date_rappel ?? "").slice(0, 10);
}

export function dossierNextAction(row = {}) {
  const explicit = row.prochaine_action?.description ?? row.prochaine_action?.titre ?? row.prochaine_action;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const missing = Number(row.nombre_documents_manquants ?? 0);
  if (missing > 0) return `Obtenir ${missing} document(s) manquant(s)`;
  const tasks = Number(row.nombre_taches_ouvertes ?? 0);
  if (tasks > 0) return `${tasks} tâche(s) à traiter`;
  return "Définir la prochaine action";
}

export function requiresInterventionToday(row = {}, today = torontoBusinessDate()) {
  const dueDate = dossierDueDate(row);
  return Number(row.nombre_taches_en_retard ?? 0) > 0
    || Number(row.nombre_documents_manquants ?? 0) > 0
    || row.statut_en_retard === true
    || Number(row.priority_score ?? 0) >= 40
    || Boolean(dueDate && dueDate <= today);
}
