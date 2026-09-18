import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  ListTodo,
  RefreshCw,
  Search,
  UsersRound
} from "lucide-react";
import {
  dossierDueDate,
  dossierNextAction,
  groupPortfolioByStage,
  KANBAN_STAGES,
  requiresInterventionToday,
  torontoBusinessDate
} from "./kanban.js";
import "./kanban.css";

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function StatusBadge({ value, row = {} }) {
  const days = Number(row.jours_dans_statut);
  const tracking = Number.isFinite(days)
    ? `Dans ce statut depuis ${days} jour(s)${row.delai_cible_jours ? `; cible ${row.delai_cible_jours} jours` : ""}`
    : "Durée du statut non disponible";
  return (
    <span
      className={`portfolio-status ${row.statut_en_retard ? "overdue" : ""}`}
      title={tracking}
      aria-label={`${value || "Statut non défini"}. ${tracking}`}
    >
      {value || "Non défini"}
      {row.statut_en_retard && " · délai dépassé"}
    </span>
  );
}

function PriorityBadge({ row }) {
  const score = Number(row.priority_score ?? 0);
  const reasons = Array.isArray(row.priority_reasons) && row.priority_reasons.length
    ? row.priority_reasons.join(" · ")
    : "Aucun élément prioritaire";
  return (
    <span
      className={`priority-badge ${score >= 40 ? "high" : score > 0 ? "medium" : "low"}`}
      title={reasons}
      aria-label={`Priorité ${score}. ${reasons}`}
    >
      Priorité {score}
    </span>
  );
}

function formatShortDate(value) {
  if (!value) return "Aucune échéance";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Aucune échéance";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" }).format(date);
}

function KanbanCard({ row, onOpenDossier }) {
  const missingDocuments = Number(row.nombre_documents_manquants ?? 0);
  const overdueTasks = Number(row.nombre_taches_en_retard ?? 0);
  const dueDate = dossierDueDate(row);
  const documentNames = Array.isArray(row.documents_manquants) ? row.documents_manquants.filter(Boolean) : [];
  const hasAlert = overdueTasks > 0 || row.statut_en_retard === true;

  return (
    <article className={`kanban-card ${hasAlert ? "has-alert" : ""}`}>
      <div className="kanban-card-top">
        <BriefcaseBusiness size={17} aria-hidden="true" />
        <PriorityBadge row={row} />
      </div>
      <h4>{row.nom_client || "Client sans nom"}</h4>
      <code>{row.code_client}</code>
      <StatusBadge value={row.statut_dossier} row={row} />
      <p className="kanban-need">{row.type_transaction || "Besoin à préciser"}</p>
      <div className="kanban-next-action">
        <span>Prochaine action</span>
        <strong>{dossierNextAction(row)}</strong>
      </div>
      <div className="kanban-card-metadata">
        <span className={dueDate && dueDate <= torontoBusinessDate() ? "late" : ""}>
          <CalendarClock size={14} aria-hidden="true" /> {formatShortDate(dueDate)}
        </span>
        <span className={missingDocuments ? "warning" : ""} title={documentNames.join(" · ") || undefined}>
          <FileWarning size={14} aria-hidden="true" /> {missingDocuments} document(s)
        </span>
        {overdueTasks > 0 && <span className="late"><AlertTriangle size={14} aria-hidden="true" /> {overdueTasks} tâche(s) en retard</span>}
      </div>
      <button type="button" onClick={() => onOpenDossier(row.code_client)} aria-label={`Ouvrir le dossier de ${row.nom_client}`}>
        Ouvrir le dossier <ArrowRight size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

export default function PortfolioViews({ view, identity, onOpenDossier }) {
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [alertFilter, setAlertFilter] = useState("");
  const [sortField, setSortField] = useState("priority_desc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  async function loadPortfolio() {
    setPending(true);
    setError("");
    try {
      const response = await identity.apiFetch("/api/portfolio?limit=100&sort=priority_score", {
        headers: { accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Le portefeuille est indisponible.");
      setRows(payload.rows ?? []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => { loadPortfolio(); }, []);

  const statuses = useMemo(() => [...new Set(rows.map((row) => row.statut_dossier).filter(Boolean))].sort(), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const matchesText = !search || normalize(`${row.nom_client} ${row.code_client}`).includes(normalize(search));
    const matchesStatus = !status || row.statut_dossier === status;
    const matchesFollowUp = !todayOnly || requiresInterventionToday(row);
    const matchesAlert = !alertFilter
      || (alertFilter === "documents" && Number(row.nombre_documents_manquants) > 0)
      || (alertFilter === "tasks" && Number(row.nombre_taches_ouvertes) > 0)
      || (alertFilter === "late" && Number(row.nombre_taches_en_retard) > 0);
    return matchesText && matchesStatus && matchesFollowUp && matchesAlert;
  }), [rows, search, status, todayOnly, alertFilter]);

  const sortedRows = useMemo(() => [...filteredRows].sort((left, right) => {
    if (sortField === "name_asc") return String(left.nom_client ?? "").localeCompare(String(right.nom_client ?? ""), "fr");
    if (sortField === "status_asc") return String(left.statut_dossier ?? "").localeCompare(String(right.statut_dossier ?? ""), "fr");
    if (sortField === "documents_desc") return Number(right.nombre_documents_manquants) - Number(left.nombre_documents_manquants);
    if (sortField === "tasks_desc") return Number(right.nombre_taches_ouvertes) - Number(left.nombre_taches_ouvertes);
    return Number(right.priority_score) - Number(left.priority_score);
  }), [filteredRows, sortField]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const kanbanGroups = useMemo(() => groupPortfolioByStage(sortedRows), [sortedRows]);

  useEffect(() => { setPage(1); }, [search, status, alertFilter, sortField, pageSize, todayOnly]);

  const metrics = useMemo(() => ({
    clients: rows.length,
    missingDocuments: rows.reduce((total, row) => total + Number(row.nombre_documents_manquants ?? 0), 0),
    openTasks: rows.reduce((total, row) => total + Number(row.nombre_taches_ouvertes ?? 0), 0),
    overdueTasks: rows.reduce((total, row) => total + Number(row.nombre_taches_en_retard ?? 0), 0)
  }), [rows]);

  if (pending) return <div className="portfolio-loading"><RefreshCw className="spin" size={20} /> Chargement du portefeuille…</div>;
  if (error) return <div className="portfolio-error" role="alert"><strong>Chargement impossible</strong><span>{error}</span><button type="button" onClick={loadPortfolio}>Réessayer</button></div>;

  if (view === "overview") {
    const priorities = [...rows].sort((a, b) => Number(b.priority_score) - Number(a.priority_score)).slice(0, 6);
    return (
      <div className="portfolio-page">
        <section className="overview-metrics" aria-label="Indicateurs du portefeuille">
          <article><UsersRound size={21} /><strong>{metrics.clients}</strong><span>Clients actifs</span></article>
          <article><FileWarning size={21} /><strong>{metrics.missingDocuments}</strong><span>Documents manquants</span></article>
          <article><ListTodo size={21} /><strong>{metrics.openTasks}</strong><span>Tâches ouvertes</span></article>
          <article className={metrics.overdueTasks ? "attention" : ""}><AlertTriangle size={21} /><strong>{metrics.overdueTasks}</strong><span>Tâches en retard</span></article>
        </section>
        <section className="portfolio-section">
          <div className="portfolio-section-heading"><div><p className="eyebrow">À traiter en priorité</p><h2>Prochains suivis</h2></div><button type="button" onClick={loadPortfolio}><RefreshCw size={16} /> Actualiser</button></div>
          <div className="priority-list">
            {priorities.map((row) => (
              <button type="button" key={row.code_client} onClick={() => onOpenDossier(row.code_client)}>
                <span className="client-monogram">{String(row.nom_client ?? "?").split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
                <span className="priority-client"><strong>{row.nom_client}</strong><small>{row.code_client} · {row.statut_dossier}</small></span>
                <span className="priority-reasons">{row.priority_reasons?.join(" · ") || "Aucune alerte"}</span>
                <PriorityBadge row={row} />
                <ArrowRight size={17} />
              </button>
            ))}
            {!priorities.length && <p className="portfolio-empty">Aucun suivi prioritaire.</p>}
          </div>
        </section>
      </div>
    );
  }

  const isClients = view === "clients";
  return (
    <div className="portfolio-page">
      <section className="portfolio-section">
        <div className="portfolio-section-heading">
          <div><p className="eyebrow">{isClients ? "Répertoire" : "Pipeline hypothécaire"}</p><h2>{isClients ? "Clients" : "Dossiers"}</h2><p>{filteredRows.length} résultat(s) dans votre portefeuille</p></div>
          <button type="button" onClick={loadPortfolio}><RefreshCw size={16} /> Actualiser</button>
        </div>
        <div className="portfolio-filters">
          <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un nom ou un code client" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut"><option value="">Tous les statuts</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
          {isClients && <select value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)} aria-label="Filtrer par alerte"><option value="">Toutes les alertes</option><option value="documents">Documents manquants</option><option value="tasks">Tâches ouvertes</option><option value="late">Tâches en retard</option></select>}
          {!isClients && <label className="follow-up-filter"><input type="checkbox" checked={todayOnly} onChange={(event) => setTodayOnly(event.target.checked)} /> À intervenir aujourd’hui</label>}
        </div>

        {isClients ? (
          <>
            <div className="client-table-tools">
              <label><ArrowUpDown size={15} /> Trier<select value={sortField} onChange={(event) => setSortField(event.target.value)}><option value="priority_desc">Priorité décroissante</option><option value="name_asc">Nom A–Z</option><option value="status_asc">Statut A–Z</option><option value="documents_desc">Documents manquants</option><option value="tasks_desc">Tâches ouvertes</option></select></label>
              <label>Afficher<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
            </div>
            <div className="client-table-wrap"><table className="client-table"><thead><tr><th>Client</th><th>Statut</th><th>Documents</th><th>Tâches</th><th>Priorité</th><th /></tr></thead><tbody>{paginatedRows.map((row) => <tr key={row.code_client}><td><strong>{row.nom_client}</strong><code>{row.code_client}</code></td><td><StatusBadge value={row.statut_dossier} row={row} /></td><td>{row.nombre_documents_manquants || 0}</td><td>{row.nombre_taches_ouvertes || 0}</td><td><PriorityBadge row={row} /></td><td><button type="button" onClick={() => onOpenDossier(row.code_client)}>Ouvrir <ArrowRight size={15} /></button></td></tr>)}</tbody></table></div>
            <div className="client-pagination" aria-label="Pagination des clients">
              <span>{sortedRows.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, sortedRows.length)} sur {sortedRows.length}</span>
              <div><button type="button" aria-label="Page précédente" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}><ChevronLeft size={16} /></button><strong>Page {currentPage} sur {pageCount}</strong><button type="button" aria-label="Page suivante" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount}><ChevronRight size={16} /></button></div>
            </div>
          </>
        ) : (
          <div className="kanban-board" aria-label="Kanban des dossiers">
            {KANBAN_STAGES.map((stage) => (
              <section className="kanban-column" key={stage.id} aria-labelledby={`kanban-${stage.id}`}>
                <header>
                  <h3 id={`kanban-${stage.id}`}>{stage.label}</h3>
                  <span aria-label={`${kanbanGroups[stage.id].length} dossier(s)`}>{kanbanGroups[stage.id].length}</span>
                </header>
                <div className="kanban-column-cards">
                  {kanbanGroups[stage.id].map((row) => (
                    <KanbanCard key={row.code_client} row={row} onOpenDossier={onOpenDossier} />
                  ))}
                  {!kanbanGroups[stage.id].length && <p className="kanban-column-empty">Aucun dossier</p>}
                </div>
              </section>
            ))}
          </div>
        )}
        {!filteredRows.length && <div className="portfolio-empty"><CheckCircle2 size={22} /> Aucun élément ne correspond à ces filtres.</div>}
      </section>
    </div>
  );
}
