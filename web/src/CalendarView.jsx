import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  UserRound,
  X
} from "lucide-react";

const stageOptions = [
  ["", "Aucune étape"],
  ["prise_mandat", "1. Premier contact et mandat"],
  ["analyse_projet", "2. Analyse du projet"],
  ["prequalification", "3. Préqualification"],
  ["recherche_propriete", "4. Recherche de propriété"],
  ["promesse_achat", "5. Promesse d’achat"],
  ["montage_soumission", "6. Montage et soumission"],
  ["comparaison_options", "7. Présentation des options"],
  ["approbation_finale", "8. Approbation finale"],
  ["coordination_notaire", "9. Coordination avec le notaire"],
  ["signature_decaissement", "10. Signature et décaissement"],
  ["suivi_post_transaction", "11. Suivi post-transaction"]
];

function startOfWeek(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function addDays(value, count) {
  const date = new Date(value);
  date.setDate(date.getDate() + count);
  return date;
}

function localInputValue(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto"
  }).format(new Date(value));
}

function eventDayKey(value) {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Toronto"
  }).format(new Date(value));
}

function dayKey(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function EventCard({ event, onEdit, onOpenDossier }) {
  return (
    <article className={`calendar-event type-${event.type}`}>
      <div><strong>{formatTime(event.debut)}</strong><span>{event.type}</span></div>
      <h4>{event.titre}</h4>
      {event.nom_client && <p><UserRound size={12} /> {event.nom_client}</p>}
      {event.etape_titre && <small>{event.etape_titre}</small>}
      {event.emplacement && <p><MapPin size={12} /> {event.emplacement}</p>}
      <div className="calendar-event-actions">
        <button type="button" onClick={() => onEdit(event)}><Pencil size={11} /> Modifier</button>
        {event.code_client && (
          <button type="button" onClick={() => onOpenDossier?.(event.code_client)}>
            <FolderOpen size={11} /> Dossier
          </button>
        )}
      </div>
    </article>
  );
}

export default function CalendarView({ identity, onOpenDossier }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState("");
  const [formErrors, setFormErrors] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const defaultStart = useMemo(() => {
    const date = new Date();
    date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0);
    return date;
  }, [formOpen]);
  const [draft, setDraft] = useState(() => ({
    title: "", type: "rencontre", clientReference: "", stageCode: "",
    start: localInputValue(new Date()), end: localInputValue(addDays(new Date(), 0)),
    location: "", description: "", reminderEnabled: true, reminderMinutes: 30
  }));

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  async function loadCalendar() {
    setPending(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start: weekStart.toISOString(),
        end: weekEnd.toISOString()
      });
      const response = await identity.apiFetch(`/api/calendar?${params}`, {
        headers: { accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "L’agenda est indisponible.");
      setEvents(payload.events ?? []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => { loadCalendar(); }, [weekStart]);

  function openForm() {
    const start = new Date(defaultStart);
    const end = new Date(start.getTime() + 60 * 60_000);
    setDraft({
      title: "", type: "rencontre", clientReference: "", stageCode: "",
      start: localInputValue(start), end: localInputValue(end), location: "",
      description: "", reminderEnabled: true, reminderMinutes: 30
    });
    setSuccess("");
    setEditingCode("");
    setFormErrors([]);
    setSubmitError("");
    setFormOpen(true);
  }

  function openEditForm(item) {
    const firstReminder = item.rappels?.[0];
    const minutesBefore = firstReminder?.date
      ? Math.max(0, Math.round((new Date(item.debut) - new Date(firstReminder.date)) / 60_000))
      : 30;
    setDraft({
      title: item.titre ?? "",
      type: item.type ?? "rencontre",
      clientReference: item.code_client ?? "",
      stageCode: item.etape_code ?? "",
      start: localInputValue(item.debut),
      end: item.fin ? localInputValue(item.fin) : "",
      location: item.emplacement ?? "",
      description: item.description ?? "",
      status: item.statut ?? "planifie",
      reminderEnabled: Boolean(item.rappels?.length),
      reminderMinutes: minutesBefore
    });
    setEditingCode(item.code_evenement);
    setFormErrors([]);
    setSubmitError("");
    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function validateDraft() {
    const fields = [];
    if (!draft.title.trim()) fields.push("Titre");
    if (!draft.start) fields.push("Date et heure de début");
    if (["rencontre", "appel", "suivi", "autre"].includes(draft.type) && !draft.end) {
      fields.push("Date et heure de fin");
    }
    if (draft.stageCode && !draft.clientReference.trim()) {
      fields.push("Client associé à l’étape du dossier");
    }
    if (draft.start && draft.end && new Date(draft.end) <= new Date(draft.start)) {
      fields.push("Une fin postérieure au début");
    }
    return fields;
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (saving) return;
    const missing = validateDraft();
    setFormErrors(missing);
    if (missing.length) return;
    setSaving(true);
    setSubmitError("");
    try {
      const response = await identity.apiFetch(
        editingCode ? `/api/calendar/events/${encodeURIComponent(editingCode)}` : "/api/calendar/events",
        {
        method: editingCode ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}`
        },
        body: JSON.stringify({
          ...draft,
          start: new Date(draft.start).toISOString(),
          end: draft.end ? new Date(draft.end).toISOString() : null,
          reminderMinutes: Number(draft.reminderMinutes)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "La création a échoué.");
      setFormOpen(false);
      setSuccess(editingCode
        ? `Événement ${payload.code_evenement ?? editingCode} modifié.`
        : `Événement ${payload.code_evenement ?? ""} ajouté à votre agenda.`);
      await loadCalendar();
    } catch (requestError) {
      setSubmitError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const reminderEvents = events.filter((event) => event.type === "rappel" || event.rappels?.length);

  return (
    <div className="calendar-page">
      <section className="calendar-toolbar">
        <div>
          <p className="eyebrow">Planification</p>
          <h2>Agenda de la semaine</h2>
          <p>{new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long" }).format(weekStart)} au {new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric" }).format(addDays(weekEnd, -1))}</p>
        </div>
        <div className="calendar-actions">
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>Aujourd’hui</button>
          <button type="button" aria-label="Semaine précédente" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={17} /></button>
          <button type="button" aria-label="Semaine suivante" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={17} /></button>
          <button type="button" onClick={loadCalendar}><RefreshCw size={16} /></button>
          <button type="button" className="calendar-primary" onClick={openForm}><Plus size={17} /> Ajouter</button>
        </div>
      </section>

      {error && <div className="portfolio-error" role="alert"><strong>Agenda</strong><span>{error}</span></div>}
      {success && <div className="calendar-success">{success}</div>}

      <div className="calendar-layout">
        <section className="week-calendar" aria-label="Calendrier de la semaine">
          {days.map((day) => {
            const key = dayKey(day);
            const dayEvents = events.filter((item) => eventDayKey(item.debut) === key);
            const isToday = dayKey(new Date()) === key;
            return (
              <div className={`calendar-day ${isToday ? "today" : ""}`} key={key}>
                <header><span>{new Intl.DateTimeFormat("fr-CA", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong></header>
                <div>{dayEvents.map((item) => <EventCard event={item} onEdit={openEditForm} onOpenDossier={onOpenDossier} key={item.code_evenement} />)}{!pending && !dayEvents.length && <span className="calendar-empty-day">Libre</span>}</div>
              </div>
            );
          })}
          {pending && <div className="calendar-loading"><RefreshCw className="spin" size={18} /> Chargement…</div>}
        </section>

        <aside className="reminder-panel">
          <div><Bell size={18} /><div><p className="eyebrow">Suivis</p><h3>Rappels de la semaine</h3></div></div>
          {reminderEvents.map((event) => (
            <article key={`reminder-${event.code_evenement}`}>
              <Clock3 size={15} />
              <div><strong>{event.titre}</strong><span>{formatTime(event.debut)} · {event.nom_client || "Sans client"}</span></div>
            </article>
          ))}
          {!pending && !reminderEvents.length && <p className="portfolio-empty">Aucun rappel cette semaine.</p>}
        </aside>
      </div>

      {formOpen && (
        <div className="calendar-modal" role="dialog" aria-modal="true" aria-label={editingCode ? "Modifier un événement" : "Ajouter un événement"}>
          <form onSubmit={saveEvent} noValidate>
            <header><div><p className="eyebrow">{editingCode ? "Planification existante" : "Nouvelle planification"}</p><h3>{editingCode ? "Modifier l’événement" : "Ajouter à l’agenda"}</h3></div><button type="button" onClick={() => setFormOpen(false)}><X size={18} /></button></header>
            {formErrors.length > 0 && (
              <div className="calendar-form-errors" role="alert">
                <strong>Champs à compléter :</strong>
                <ul>{formErrors.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {submitError && (
              <div className="calendar-form-errors" role="alert">
                <strong>Modification non enregistrée</strong>
                <p>{submitError}</p>
              </div>
            )}
            <label>Titre<input aria-invalid={formErrors.includes("Titre")} maxLength="160" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Rencontre de préautorisation" /></label>
            <div className="calendar-form-row">
              <label>Type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option value="rencontre">Rencontre</option><option value="appel">Appel</option><option value="suivi">Suivi</option><option value="echeance">Échéance</option><option value="rappel">Rappel</option><option value="autre">Autre</option></select></label>
              <label>Client <span className="field-help">Requis si une étape est choisie</span><input aria-invalid={formErrors.includes("Client associé à l’étape du dossier")} value={draft.clientReference} onChange={(e) => setDraft({ ...draft, clientReference: e.target.value })} placeholder="CLI-… ou nom" /></label>
            </div>
            <label>Étape du dossier<select value={draft.stageCode} onChange={(e) => setDraft({ ...draft, stageCode: e.target.value })}>{stageOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <div className="calendar-form-row"><label>Début<input aria-invalid={formErrors.includes("Date et heure de début")} type="datetime-local" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label><label>Fin<input aria-invalid={formErrors.some((item) => item.includes("fin"))} type="datetime-local" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label></div>
            <label>Lieu ou mode<input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Téléphone, bureau ou visioconférence" /></label>
            <label>Notes<textarea rows="3" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <div className="calendar-reminder-setting"><label><input type="checkbox" checked={draft.reminderEnabled} onChange={(e) => setDraft({ ...draft, reminderEnabled: e.target.checked })} /> Créer un rappel</label>{draft.reminderEnabled && <label><input min="0" max="43200" type="number" value={draft.reminderMinutes} onChange={(e) => setDraft({ ...draft, reminderMinutes: e.target.value })} /> minutes avant</label>}</div>
            <footer><button type="button" onClick={() => setFormOpen(false)}>Annuler</button><button className="calendar-primary" disabled={saving} type="submit">{saving ? "Enregistrement…" : editingCode ? "Enregistrer les modifications" : "Confirmer et ajouter"}</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
