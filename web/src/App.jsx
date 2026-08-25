import { useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  FolderSearch2,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import AdminRepresentatives from "./AdminRepresentatives.jsx";
import PortfolioViews from "./PortfolioViews.jsx";

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Bonjour! Je peux consulter le statut, le prêteur, le taux, le financement, la fermeture, le notaire, l’évaluation, l’assurance, les documents ou les tâches d’un client. Par quoi souhaitez-vous commencer?"
  }
];

const actions = [
  {
    icon: UsersRound,
    label: "Clients récents",
    detail: "Voir les 10 dernières fiches",
    prompt: "Affiche les 10 derniers clients avec leur code client et leur statut.",
    intent: "clients_recents"
  },
  {
    icon: FileText,
    label: "Documents manquants",
    detail: "Voir les clients à relancer",
    prompt: "Quels clients ont des documents manquants?",
    intent: "clients_documents_manquants"
  },
  {
    icon: ListTodo,
    label: "Tâches ouvertes",
    detail: "Prioriser les prochains suivis",
    action: "tasks"
  },
  {
    icon: FolderSearch2,
    label: "Dossier client",
    detail: "Statut, taux et financement",
    action: "dossier"
  }
];

const navItems = [
  { icon: LayoutDashboard, label: "Vue d’ensemble", view: "overview" },
  { icon: MessageSquareText, label: "Assistant", view: "assistant" },
  { icon: UsersRound, label: "Clients", view: "clients" },
  { icon: FolderSearch2, label: "Dossiers", view: "dossiers" }
];

const journeyStatusLabels = {
  a_faire: "À faire",
  en_cours: "En cours",
  bloquee: "Bloquée",
  complete: "Complétée",
  non_applicable: "Non applicable"
};

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
}

function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CL";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "Non renseigné";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return "Date non définie";
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatAddress(address = {}) {
  const street = [address.numero_civique, address.type_rue, address.rue, address.direction]
    .filter(Boolean).join(" ");
  const locality = [address.unite ? `Unité ${address.unite}` : null, address.ville,
    address.province, address.code_postal, address.pays]
    .filter(Boolean).join(", ");
  return [street, locality].filter(Boolean).join(" — ") || "Non renseignée";
}

function createDossierDraft(dossier) {
  const profil = dossier.profil_client ?? {};
  const adresse = profil.adresse ?? {};
  const projet = dossier.projet_hypothecaire ?? {};
  return {
    profil_client: {
      prenom: profil.prenom ?? dossier.prenom ?? "",
      nom: profil.nom ?? dossier.nom ?? "",
      date_naissance: String(profil.date_naissance ?? "").slice(0, 10),
      telephone: dossier.telephone ?? profil.telephone ?? "",
      telephone_type: profil.telephone_type ?? "",
      courriel: dossier.courriel ?? profil.courriel ?? "",
      canal_contact_prefere: profil.canal_contact_prefere ?? "",
      moment_contact_prefere: profil.moment_contact_prefere ?? "",
      adresse: {
        numero_civique: adresse.numero_civique ?? "",
        rue: adresse.rue ?? "",
        type_rue: adresse.type_rue ?? "",
        direction: adresse.direction ?? "",
        unite: adresse.unite ?? "",
        ville: adresse.ville ?? "",
        province: adresse.province ?? "",
        code_postal: adresse.code_postal ?? "",
        pays: adresse.pays ?? "Canada",
        validee: Boolean(adresse.validee)
      }
    },
    projet_hypothecaire: {
      type_transaction: projet.type_transaction ?? dossier.type_transaction ?? "",
      echeancier_projet: projet.echeancier_projet ?? "",
      type_propriete: projet.type_propriete ?? "",
      type_occupation: projet.type_occupation ?? "",
      prix_achat: projet.prix_achat ?? "",
      mise_de_fonds: projet.mise_de_fonds ?? "",
      valeur_propriete: projet.valeur_propriete ?? "",
      solde_hypothecaire: projet.solde_hypothecaire ?? "",
      montant_requis: projet.montant_requis ?? "",
      date_renouvellement: String(projet.date_renouvellement ?? "").slice(0, 10),
      commentaires: projet.commentaires ?? "",
      statut_soumission: projet.statut_soumission ?? "Brouillon"
    },
    participants: (dossier.participants ?? []).map((participant) => ({
      role: participant.role ?? "Codemandeur",
      prenom: participant.prenom ?? "",
      nom: participant.nom ?? "",
      date_naissance: String(participant.date_naissance ?? "").slice(0, 10),
      telephone: participant.telephone ?? "",
      telephone_type: participant.telephone_type ?? "",
      courriel: participant.courriel ?? "",
      meme_adresse_client: Boolean(participant.meme_adresse_client),
      canal_contact_prefere: participant.canal_contact_prefere ?? "",
      moment_contact_prefere: participant.moment_contact_prefere ?? ""
    })),
    parcours_hypothecaire: (dossier.parcours_hypothecaire?.etapes ?? []).map((stage) => ({
      code: stage.code,
      statut: stage.statut ?? "a_faire",
      responsable: stage.responsable ?? "",
      date_debut: String(stage.date_debut ?? "").slice(0, 10),
      date_echeance: String(stage.date_echeance ?? "").slice(0, 10),
      date_completion: String(stage.date_completion ?? "").slice(0, 10),
      notes: stage.notes ?? "",
      conditions: stage.conditions ?? []
    }))
  };
}

function EditField({ label, value, onChange, type = "text", ...props }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function MessageContent({ content }) {
  const lines = String(content).split("\n").filter((line, index, all) => {
    return line.trim() || (index > 0 && index < all.length - 1);
  });
  const tableStart = lines.findIndex((line) => /^\s*\|.*\|\s*$/.test(line));
  const tableLines = tableStart >= 0
    ? lines.slice(tableStart).filter((line) => /^\s*\|.*\|\s*$/.test(line))
    : [];
  const tableRows = tableLines
    .filter((line, index) => index !== 1 || !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

  return (
    <div className="message-copy">
      {lines.slice(0, tableStart >= 0 ? tableStart : lines.length).map((line, index) => {
        const item = line.match(/^\s*[-*•]\s+(.+)/);
        if (item) {
          return (
            <div className="message-list-item" key={`${index}-${line}`}>
              <span aria-hidden="true" />
              <p>{item[1]}</p>
            </div>
          );
        }

        return <p key={`${index}-${line}`}>{line}</p>;
      })}
      {tableRows.length > 0 && (
        <div className="message-table-wrap">
          <table className="message-table">
            <thead><tr>{tableRows[0].map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
            <tbody>
              {tableRows.slice(1).map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function App({ identity }) {
  const [activeView, setActiveView] = useState("assistant");
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [dossierResult, setDossierResult] = useState(null);
  const [dossierPending, setDossierPending] = useState(false);
  const [dossierError, setDossierError] = useState("");
  const [lastResultCodes, setLastResultCodes] = useState([]);
  const [editingDossier, setEditingDossier] = useState(false);
  const [dossierDraft, setDossierDraft] = useState(null);
  const [dossierSaving, setDossierSaving] = useState(false);
  const [dossierSaveError, setDossierSaveError] = useState("");
  const [dossierSaveSuccess, setDossierSaveSuccess] = useState("");
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const sessionId = useMemo(createSessionId, []);
  const inputRef = useRef(null);
  const dossierInputRef = useRef(null);
  const dossierRequestIdRef = useRef(0);
  const representativeName = identity.user.name || "Représentant";
  const representativeInitials = getInitials(representativeName);
  const isAdministrator = identity.user.role === "admin";
  const pageTitles = {
    overview: ["Espace conseiller", "Vue d’ensemble"],
    assistant: ["Espace conseiller", "Suivi des clients"],
    clients: ["Portefeuille", "Clients"],
    dossiers: ["Suivi hypothécaire", "Dossiers"],
    administration: ["Sécurité de la plateforme", "Administration"]
  };

  function beginDossierEdit(dossier) {
    setDossierDraft(createDossierDraft(dossier));
    setDossierSaveError("");
    setDossierSaveSuccess("");
    setSaveConfirmed(false);
    setEditingDossier(true);
  }

  function updateDraftSection(section, field, value) {
    setDossierDraft((current) => ({
      ...current,
      [section]: { ...current[section], [field]: value }
    }));
  }

  function updateDraftAddress(field, value) {
    setDossierDraft((current) => ({
      ...current,
      profil_client: {
        ...current.profil_client,
        adresse: { ...current.profil_client.adresse, [field]: value }
      }
    }));
  }

  function updateParticipant(index, field, value) {
    setDossierDraft((current) => ({
      ...current,
      participants: current.participants.map((participant, participantIndex) =>
        participantIndex === index ? { ...participant, [field]: value } : participant
      )
    }));
  }

  function addParticipant() {
    setDossierDraft((current) => ({
      ...current,
      participants: [...current.participants, {
        role: "Codemandeur", prenom: "", nom: "", date_naissance: "",
        telephone: "", telephone_type: "", courriel: "", meme_adresse_client: true,
        canal_contact_prefere: "", moment_contact_prefere: ""
      }]
    }));
  }

  function updateJourneyStage(index, field, value) {
    setDossierDraft((current) => ({
      ...current,
      parcours_hypothecaire: current.parcours_hypothecaire.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, [field]: value } : stage
      )
    }));
  }

  async function saveDossier(event) {
    event.preventDefault();
    if (!saveConfirmed || dossierSaving || !dossierResult?.dossier?.code_client) return;
    setDossierSaving(true);
    setDossierSaveError("");
    setDossierSaveSuccess("");
    try {
      const response = await identity.apiFetch(
        `/api/clients/${encodeURIComponent(dossierResult.dossier.code_client)}/dossier`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            ...dossierDraft,
            confirmed: true,
            requestId: globalThis.crypto?.randomUUID?.() ?? `save-${Date.now()}`
          })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "La sauvegarde du dossier a échoué.");
      setDossierResult(payload);
      setEditingDossier(false);
      setSaveConfirmed(false);
      setDossierSaveSuccess("Dossier enregistré avec succès.");
    } catch (saveError) {
      setDossierSaveError(saveError.message);
    } finally {
      setDossierSaving(false);
    }
  }

  async function loadClientDossier(rawReference = clientReference) {
    const reference = rawReference.trim();
    if (!reference) return;
    const requestId = ++dossierRequestIdRef.current;

    setClientReference(reference);
    setDossierPending(true);
    setDossierError("");
    setDossierResult(null);
    setEditingDossier(false);
    setDossierSaveError("");
    setDossierSaveSuccess("");

    try {
      const response = await identity.apiFetch(
        `/api/clients/${encodeURIComponent(reference)}/dossier`,
        { headers: { accept: "application/json" } }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Le dossier n’est pas disponible pour le moment.");
      }

      if (requestId !== dossierRequestIdRef.current) return;
      setDossierResult(payload);
      if (!payload.trouve && !payload.ambigue) {
        setDossierError("Aucun dossier client ne correspond à cette recherche.");
      }
    } catch (requestError) {
      if (requestId !== dossierRequestIdRef.current) return;
      setDossierResult(null);
      setDossierError(requestError.message);
    } finally {
      if (requestId === dossierRequestIdRef.current) {
        setDossierPending(false);
      }
    }
  }

  function focusDossierSearch(message = "Sélectionnez d’abord un dossier client.") {
    setDossierError(message);
    window.setTimeout(() => dossierInputRef.current?.focus(), 0);
  }

  function runQuickAction(action) {
    if (action.prompt) {
      sendMessage(action.prompt, action.intent);
      return;
    }

    const selectedCode = dossierResult?.dossier?.code_client;
    if (!selectedCode) {
      focusDossierSearch();
      return;
    }

    if (action.action === "documents") {
      sendMessage(`Quels documents manquent pour ${selectedCode} ?`);
    } else if (action.action === "tasks") {
      sendMessage(`Quelles sont les tâches ouvertes pour ${selectedCode} ?`);
    } else {
      loadClientDossier(selectedCode);
    }
  }

  function submitDossierSearch(event) {
    event.preventDefault();
    loadClientDossier(clientReference);
  }

  async function sendMessage(rawMessage, intent = null) {
    const message = rawMessage.trim();
    if (!message || pending) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setPending(true);

    try {
      const response = await identity.apiFetch("/api/agent/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          ...(intent ? { intent } : {}),
          context: {
            activeClient: dossierResult?.dossier?.code_client ?? null,
            lastResultCodes
          }
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "L’agent n’est pas disponible pour le moment.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.reply
        }
      ]);

      if (Array.isArray(payload.data?.result_codes) && payload.data.result_codes.length) {
        setLastResultCodes(payload.data.result_codes);
      }

      if (payload.clientReference) {
        await loadClientDossier(payload.clientReference);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function submit(event) {
    event.preventDefault();
    sendMessage(draft);
  }

  return (
    <div className="app-shell">
      <button
        className="mobile-menu"
        type="button"
        aria-label="Ouvrir la navigation"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu size={21} />
      </button>

      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Fermer la navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Clair</strong>
            <small>Assistant hypothécaire</small>
          </div>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Fermer la navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <nav aria-label="Navigation principale">
          <p className="nav-label">Espace de travail</p>
          {navItems.map(({ icon: Icon, label, view }) => (
            <button
              className={`nav-item ${view === activeView ? "active" : ""}`}
              type="button"
              key={label}
              onClick={() => {
                setActiveView(view);
                setSidebarOpen(false);
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {view === activeView && <span className="nav-active-dot" />}
            </button>
          ))}
          {isAdministrator && (
            <button
              className={`nav-item ${activeView === "administration" ? "active" : ""}`}
              type="button"
              onClick={() => { setActiveView("administration"); setSidebarOpen(false); }}
            >
              <ShieldCheck size={19} strokeWidth={1.8} />
              <span>Administration</span>
              {activeView === "administration" && <span className="nav-active-dot" />}
            </button>
          )}
        </nav>

        <div className="sidebar-status">
          <div className="status-icon"><ShieldCheck size={18} /></div>
          <div>
            <strong>Traitement local</strong>
            <span>Données protégées par RLS</span>
          </div>
        </div>

        <div className="profile-card">
          <div className="avatar">{representativeInitials}</div>
          <div>
            <strong>{representativeName}</strong>
            <span>{identity.user.email || "Session Keycloak"}</span>
          </div>
          <button className="logout-button" type="button" onClick={identity.logout} aria-label="Se déconnecter">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{pageTitles[activeView]?.[0]}</p>
            <h1>{pageTitles[activeView]?.[1]}</h1>
          </div>
          <div className="topbar-actions">
            <div className="environment-pill">
              <span />
              Services locaux actifs
            </div>
            <button className="icon-button" type="button" aria-label="Rechercher">
              <Search size={19} />
            </button>
            <div className="top-avatar" aria-label="Profil du représentant">{representativeInitials}</div>
          </div>
        </header>

        {activeView === "administration" ? (
          <AdminRepresentatives identity={identity} />
        ) : activeView !== "assistant" ? (
          <PortfolioViews
            view={activeView}
            identity={identity}
            onOpenDossier={(code) => {
              setActiveView("assistant");
              loadClientDossier(code);
            }}
          />
        ) : (
        <div className="content-grid">
          <section className="conversation-panel" aria-label="Assistant conversationnel">
            <div className="assistant-heading">
              <div className="assistant-title">
                <div className="assistant-icon"><Sparkles size={21} /></div>
                <div>
                  <h2>Assistant CRM</h2>
                  <p>Propulsé localement par Ollama et vos services PostgreSQL</p>
                </div>
              </div>
              <span className="read-only-pill">Lecture seule</span>
            </div>

            <div className="quick-actions" aria-label="Suggestions">
              {actions.map((action) => {
                const { icon: Icon, label, detail } = action;
                return (
                  <button
                    type="button"
                    className="action-card"
                    key={label}
                    onClick={() => runQuickAction(action)}
                    disabled={pending || dossierPending}
                  >
                    <span className="action-icon"><Icon size={19} /></span>
                    <span>
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="message-stream" aria-live="polite">
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-avatar" aria-hidden="true">
                    {message.role === "assistant" ? <Bot size={18} /> : <UserRound size={18} />}
                  </div>
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.role === "assistant" ? "Assistant CRM" : "Vous"}</strong>
                      <span>{message.role === "assistant" ? "À l’instant" : "Message envoyé"}</span>
                    </div>
                    <MessageContent content={message.content} />
                  </div>
                </article>
              ))}

              {pending && (
                <article className="message assistant pending-message">
                  <div className="message-avatar"><Bot size={18} /></div>
                  <div className="message-body">
                    <div className="message-meta"><strong>Assistant CRM</strong></div>
                    <div className="thinking"><span /><span /><span /> Analyse du dossier</div>
                  </div>
                </article>
              )}
            </div>

            <div className="composer-wrap">
              {error && (
                <div className="error-banner" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => setError("")} aria-label="Fermer"><X size={16} /></button>
                </div>
              )}
              <form className="composer" onSubmit={submit}>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit(event);
                    }
                  }}
                  placeholder="Statut, prêteur, taux, fermeture, documents ou tâches…"
                  rows="2"
                  disabled={pending}
                  aria-label="Message à l’assistant"
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={!draft.trim() || pending}
                  aria-label="Envoyer le message"
                >
                  <ArrowUp size={19} />
                </button>
              </form>
              <p className="composer-note">
                L’assistant peut faire des erreurs. Validez les informations avant toute action client.
              </p>
            </div>
          </section>

          <aside className="context-panel" aria-label="Contexte du dossier">
            <div className="context-heading">
              <div>
                <p className="eyebrow">Consultation CRM</p>
                <h2>Dossier client</h2>
              </div>
              {dossierResult?.dossier?.statut_dossier && (
                <span className="context-status">{dossierResult.dossier.statut_dossier}</span>
              )}
            </div>

            <form className="dossier-search" onSubmit={submitDossierSearch}>
              <label htmlFor="client-reference">Nom ou code client</label>
              <div>
                <input
                  ref={dossierInputRef}
                  id="client-reference"
                  value={clientReference}
                  onChange={(event) => setClientReference(event.target.value.slice(0, 120))}
                  placeholder="Nom du client ou code CLI-…"
                  disabled={dossierPending}
                />
                <button type="submit" disabled={!clientReference.trim() || dossierPending}>
                  {dossierPending ? <RefreshCw className="spin" size={17} /> : <Search size={17} />}
                  <span>Afficher</span>
                </button>
              </div>
            </form>

            {dossierError && <div className="dossier-error" role="alert">{dossierError}</div>}

            {dossierResult?.ambigue && (
              <div className="dossier-choices">
                <strong>Plusieurs clients correspondent</strong>
                <p>Sélectionnez le bon dossier :</p>
                {dossierResult.correspondances?.map((client) => (
                  <button
                    type="button"
                    key={client.code_client}
                    onClick={() => loadClientDossier(client.code_client)}
                  >
                    <span>{client.nom_client}</span>
                    <code>{client.code_client}</code>
                  </button>
                ))}
              </div>
            )}

            {dossierPending && !dossierResult && (
              <div className="dossier-loading"><RefreshCw className="spin" size={20} /> Chargement du dossier…</div>
            )}

            {dossierResult?.dossier && (() => {
              const dossier = dossierResult.dossier;
              const resume = dossier.resume_dossier ?? {};
              const documentsManquants = (dossier.documents ?? []).filter((document) =>
                ["a recevoir", "à recevoir", "manquant", "en attente"]
                  .includes(String(document.statut ?? "").toLowerCase())
              );
              const tachesOuvertes = (dossier.taches ?? []).filter((tache) =>
                ["ouverte", "ouvert", "en cours", "à faire", "a faire"]
                  .includes(String(tache.statut ?? "").toLowerCase())
              );
              const prochaineAction = dossier.prochaine_action;
              const profil = dossier.profil_client ?? {};
              const projet = dossier.projet_hypothecaire ?? {};
              const participants = dossier.participants ?? [];
              const consentements = dossier.consentements ?? [];
              const journey = dossier.parcours_hypothecaire ?? {};
              const journeyStages = journey.etapes ?? [];

              return (
                <div className="dossier-content">
                  <div className="client-summary">
                    <div className="client-initials">{getInitials(dossier.nom_client)}</div>
                    <div>
                      <strong>{dossier.nom_client}</strong>
                      <code>{dossier.code_client}</code>
                    </div>
                  </div>

                  <div className="dossier-edit-actions">
                    {!editingDossier ? (
                      <button type="button" onClick={() => beginDossierEdit(dossier)}>Modifier le dossier</button>
                    ) : (
                      <button type="button" className="secondary" onClick={() => setEditingDossier(false)} disabled={dossierSaving}>Annuler</button>
                    )}
                  </div>
                  {dossierSaveSuccess && <div className="dossier-success" role="status">{dossierSaveSuccess}</div>}

                  {editingDossier && dossierDraft && (
                    <form className="dossier-edit-form" onSubmit={saveDossier}>
                      <fieldset disabled={dossierSaving}>
                        <legend>Profil et coordonnées</legend>
                        <div className="edit-grid">
                          <EditField label="Prénom" value={dossierDraft.profil_client.prenom} onChange={(value) => updateDraftSection("profil_client", "prenom", value)} required />
                          <EditField label="Nom" value={dossierDraft.profil_client.nom} onChange={(value) => updateDraftSection("profil_client", "nom", value)} required />
                          <EditField label="Date de naissance" type="date" value={dossierDraft.profil_client.date_naissance} onChange={(value) => updateDraftSection("profil_client", "date_naissance", value)} />
                          <EditField label="Téléphone" type="tel" value={dossierDraft.profil_client.telephone} onChange={(value) => updateDraftSection("profil_client", "telephone", value)} />
                          <EditField label="Type de téléphone" value={dossierDraft.profil_client.telephone_type} onChange={(value) => updateDraftSection("profil_client", "telephone_type", value)} />
                          <EditField label="Courriel" type="email" value={dossierDraft.profil_client.courriel} onChange={(value) => updateDraftSection("profil_client", "courriel", value)} />
                          <EditField label="Canal préféré" value={dossierDraft.profil_client.canal_contact_prefere} onChange={(value) => updateDraftSection("profil_client", "canal_contact_prefere", value)} />
                          <EditField label="Moment préféré" value={dossierDraft.profil_client.moment_contact_prefere} onChange={(value) => updateDraftSection("profil_client", "moment_contact_prefere", value)} />
                        </div>
                      </fieldset>

                      <fieldset disabled={dossierSaving}>
                        <legend>Adresse</legend>
                        <div className="edit-grid">
                          <EditField label="Numéro" value={dossierDraft.profil_client.adresse.numero_civique} onChange={(value) => updateDraftAddress("numero_civique", value)} />
                          <EditField label="Rue" value={dossierDraft.profil_client.adresse.rue} onChange={(value) => updateDraftAddress("rue", value)} />
                          <EditField label="Type de rue" value={dossierDraft.profil_client.adresse.type_rue} onChange={(value) => updateDraftAddress("type_rue", value)} />
                          <EditField label="Unité" value={dossierDraft.profil_client.adresse.unite} onChange={(value) => updateDraftAddress("unite", value)} />
                          <EditField label="Ville" value={dossierDraft.profil_client.adresse.ville} onChange={(value) => updateDraftAddress("ville", value)} />
                          <EditField label="Province" value={dossierDraft.profil_client.adresse.province} onChange={(value) => updateDraftAddress("province", value)} />
                          <EditField label="Code postal" value={dossierDraft.profil_client.adresse.code_postal} onChange={(value) => updateDraftAddress("code_postal", value)} maxLength="7" />
                          <EditField label="Pays" value={dossierDraft.profil_client.adresse.pays} onChange={(value) => updateDraftAddress("pays", value)} />
                        </div>
                      </fieldset>

                      <fieldset disabled={dossierSaving}>
                        <legend>Projet hypothécaire</legend>
                        <div className="edit-grid">
                          <EditField label="Type de transaction" value={dossierDraft.projet_hypothecaire.type_transaction} onChange={(value) => updateDraftSection("projet_hypothecaire", "type_transaction", value)} />
                          <EditField label="Échéancier" value={dossierDraft.projet_hypothecaire.echeancier_projet} onChange={(value) => updateDraftSection("projet_hypothecaire", "echeancier_projet", value)} />
                          <EditField label="Type de propriété" value={dossierDraft.projet_hypothecaire.type_propriete} onChange={(value) => updateDraftSection("projet_hypothecaire", "type_propriete", value)} />
                          <EditField label="Occupation" value={dossierDraft.projet_hypothecaire.type_occupation} onChange={(value) => updateDraftSection("projet_hypothecaire", "type_occupation", value)} />
                          <EditField label="Prix d’achat" type="number" min="0" step="0.01" value={dossierDraft.projet_hypothecaire.prix_achat} onChange={(value) => updateDraftSection("projet_hypothecaire", "prix_achat", value)} />
                          <EditField label="Mise de fonds" type="number" min="0" step="0.01" value={dossierDraft.projet_hypothecaire.mise_de_fonds} onChange={(value) => updateDraftSection("projet_hypothecaire", "mise_de_fonds", value)} />
                          <EditField label="Valeur de la propriété" type="number" min="0" step="0.01" value={dossierDraft.projet_hypothecaire.valeur_propriete} onChange={(value) => updateDraftSection("projet_hypothecaire", "valeur_propriete", value)} />
                          <EditField label="Solde hypothécaire" type="number" min="0" step="0.01" value={dossierDraft.projet_hypothecaire.solde_hypothecaire} onChange={(value) => updateDraftSection("projet_hypothecaire", "solde_hypothecaire", value)} />
                          <EditField label="Montant requis" type="number" min="0" step="0.01" value={dossierDraft.projet_hypothecaire.montant_requis} onChange={(value) => updateDraftSection("projet_hypothecaire", "montant_requis", value)} />
                          <EditField label="Date de renouvellement" type="date" value={dossierDraft.projet_hypothecaire.date_renouvellement} onChange={(value) => updateDraftSection("projet_hypothecaire", "date_renouvellement", value)} />
                          <EditField label="Statut de soumission" value={dossierDraft.projet_hypothecaire.statut_soumission} onChange={(value) => updateDraftSection("projet_hypothecaire", "statut_soumission", value)} />
                        </div>
                        <label className="edit-field edit-field-wide">
                          <span>Commentaires</span>
                          <textarea value={dossierDraft.projet_hypothecaire.commentaires} onChange={(event) => updateDraftSection("projet_hypothecaire", "commentaires", event.target.value)} maxLength="2000" rows="3" />
                        </label>
                      </fieldset>

                      <fieldset disabled={dossierSaving}>
                        <div className="edit-legend-row">
                          <legend>Participants</legend>
                          <button type="button" onClick={addParticipant} disabled={dossierDraft.participants.length >= 5}>Ajouter</button>
                        </div>
                        {dossierDraft.participants.map((participant, index) => (
                          <div className="participant-editor" key={`participant-${index}`}>
                            <div className="participant-editor-heading">
                              <strong>Participant {index + 1}</strong>
                              <button type="button" onClick={() => setDossierDraft((current) => ({ ...current, participants: current.participants.filter((_, itemIndex) => itemIndex !== index) }))}>Retirer</button>
                            </div>
                            <div className="edit-grid">
                              <label className="edit-field"><span>Rôle</span><select value={participant.role} onChange={(event) => updateParticipant(index, "role", event.target.value)}><option>Codemandeur</option><option>Garant</option><option>Autre</option></select></label>
                              <EditField label="Prénom" value={participant.prenom} onChange={(value) => updateParticipant(index, "prenom", value)} required />
                              <EditField label="Nom" value={participant.nom} onChange={(value) => updateParticipant(index, "nom", value)} required />
                              <EditField label="Date de naissance" type="date" value={participant.date_naissance} onChange={(value) => updateParticipant(index, "date_naissance", value)} />
                              <EditField label="Téléphone" type="tel" value={participant.telephone} onChange={(value) => updateParticipant(index, "telephone", value)} />
                              <EditField label="Courriel" type="email" value={participant.courriel} onChange={(value) => updateParticipant(index, "courriel", value)} />
                            </div>
                            <label className="edit-checkbox"><input type="checkbox" checked={participant.meme_adresse_client} onChange={(event) => updateParticipant(index, "meme_adresse_client", event.target.checked)} /> Même adresse que le client</label>
                          </div>
                        ))}
                      </fieldset>

                      <fieldset disabled={dossierSaving}>
                        <legend>Parcours hypothécaire</legend>
                        <p className="journey-help">Mettez à jour l’avancement, le responsable et l’échéance de chaque étape. Les changements sont journalisés avec le dossier.</p>
                        <div className="journey-editor-list">
                          {dossierDraft.parcours_hypothecaire.map((stage, index) => {
                            const definition = journeyStages.find((item) => item.code === stage.code) ?? {};
                            return (
                              <article className="journey-editor" key={stage.code}>
                                <div className="journey-editor-heading">
                                  <span>{definition.ordre ?? index + 1}</span>
                                  <strong>{definition.titre ?? stage.code}</strong>
                                </div>
                                <div className="edit-grid">
                                  <label className="edit-field">
                                    <span>Statut</span>
                                    <select value={stage.statut} onChange={(event) => updateJourneyStage(index, "statut", event.target.value)}>
                                      {Object.entries(journeyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                    </select>
                                  </label>
                                  <EditField label="Responsable" value={stage.responsable} onChange={(value) => updateJourneyStage(index, "responsable", value)} />
                                  <EditField label="Début" type="date" value={stage.date_debut} onChange={(value) => updateJourneyStage(index, "date_debut", value)} />
                                  <EditField label="Échéance" type="date" value={stage.date_echeance} onChange={(value) => updateJourneyStage(index, "date_echeance", value)} />
                                  {stage.statut === "complete" && <EditField label="Complétée le" type="date" value={stage.date_completion} onChange={(value) => updateJourneyStage(index, "date_completion", value)} />}
                                </div>
                                <label className="edit-field edit-field-wide">
                                  <span>Notes</span>
                                  <textarea rows="2" maxLength="2000" value={stage.notes} onChange={(event) => updateJourneyStage(index, "notes", event.target.value)} />
                                </label>
                              </article>
                            );
                          })}
                        </div>
                      </fieldset>

                      <div className="consent-readonly-note"><ShieldCheck size={16} /> Les consentements ne sont jamais modifiés depuis ce formulaire.</div>
                      {dossierSaveError && <div className="dossier-error" role="alert">{dossierSaveError}</div>}
                      <label className="save-confirmation">
                        <input type="checkbox" checked={saveConfirmed} onChange={(event) => setSaveConfirmed(event.target.checked)} />
                        Je confirme avoir vérifié ces renseignements avant l’enregistrement.
                      </label>
                      <button className="save-dossier-button" type="submit" disabled={!saveConfirmed || dossierSaving}>
                        {dossierSaving ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />}
                        {dossierSaving ? "Enregistrement…" : "Enregistrer les changements"}
                      </button>
                    </form>
                  )}

                  <div className="contact-list">
                    <span><Mail size={14} /> {dossier.courriel || "Courriel non renseigné"}</span>
                    <span><Phone size={14} /> {dossier.telephone || "Téléphone non renseigné"}</span>
                  </div>

                  <div className="metric-grid metric-grid-three">
                    <div className="metric-card">
                      <MessageSquareText size={18} />
                      <strong>{resume.nombre_interactions ?? 0}</strong>
                      <span>interaction(s)</span>
                    </div>
                    <div className="metric-card">
                      <FileText size={18} />
                      <strong>{resume.nombre_documents_manquants ?? 0}</strong>
                      <span>document(s) manquant(s)</span>
                    </div>
                    <div className="metric-card">
                      <ListTodo size={18} />
                      <strong>{resume.nombre_taches_ouvertes ?? 0}</strong>
                      <span>tâche(s) ouverte(s)</span>
                    </div>
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><UserRound size={17} /> Profil du client</div>
                    <dl className="profile-grid">
                      <div><dt>Date de naissance</dt><dd>{profil.date_naissance ? formatDate(profil.date_naissance) : "Non renseignée"}</dd></div>
                      <div><dt>Type de téléphone</dt><dd>{profil.telephone_type || "Non renseigné"}</dd></div>
                      <div><dt>Contact préféré</dt><dd>{profil.canal_contact_prefere || "Non renseigné"}</dd></div>
                      <div><dt>Moment préféré</dt><dd>{profil.moment_contact_prefere || "Non renseigné"}</dd></div>
                      <div><dt>Emploi</dt><dd>{dossier.type_emploi || "Non renseigné"}</dd></div>
                      <div><dt>Employeur</dt><dd>{dossier.employeur || "Non renseigné"}</dd></div>
                      <div><dt>Revenu annuel</dt><dd>{formatMoney(dossier.revenu_annuel)}</dd></div>
                    </dl>
                    <p className="dossier-summary"><strong>Adresse :</strong> {formatAddress(profil.adresse)}</p>
                    {dossier.objectif && <p className="dossier-summary"><strong>Objectif :</strong> {dossier.objectif}</p>}
                    {dossier.resume && <p className="dossier-summary">{dossier.resume}</p>}
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><BriefcaseBusiness size={17} /> Projet hypothécaire</div>
                    <dl className="profile-grid">
                      <div><dt>Transaction</dt><dd>{projet.type_transaction || dossier.type_transaction || "Non renseignée"}</dd></div>
                      <div><dt>Échéancier</dt><dd>{projet.echeancier_projet || "Non renseigné"}</dd></div>
                      <div><dt>Propriété</dt><dd>{projet.type_propriete || "Non renseignée"}</dd></div>
                      <div><dt>Occupation</dt><dd>{projet.type_occupation || "Non renseignée"}</dd></div>
                      <div><dt>Prix d’achat</dt><dd>{formatMoney(projet.prix_achat)}</dd></div>
                      <div><dt>Mise de fonds</dt><dd>{projet.mise_de_fonds != null ? formatMoney(projet.mise_de_fonds) : (projet.mise_de_fonds_texte || "Non renseignée")}</dd></div>
                      <div><dt>Montant requis</dt><dd>{formatMoney(projet.montant_requis)}</dd></div>
                      <div><dt>Statut de soumission</dt><dd>{projet.statut_soumission || "Non renseigné"}</dd></div>
                    </dl>
                    {projet.commentaires && <p className="dossier-summary"><strong>Commentaires :</strong> {projet.commentaires}</p>}
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><UsersRound size={17} /> Participants au dossier</div>
                    {participants.length ? (
                      <ul className="record-list">
                        {participants.map((participant, index) => (
                          <li key={`${participant.prenom}-${participant.nom}-${index}`}>
                            <span>{participant.prenom} {participant.nom}</span>
                            <small>{participant.role}{participant.meme_adresse_client ? " — même adresse" : ""}</small>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="empty-records">Aucun codemandeur ou garant.</p>}
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><CheckCircle2 size={17} /> Parcours hypothécaire</div>
                    <div className="journey-summary">
                      <div>
                        <strong>{journey.progression_pourcentage ?? 0}%</strong>
                        <span>du parcours complété</span>
                      </div>
                      <div className="journey-progress" role="progressbar" aria-valuenow={journey.progression_pourcentage ?? 0} aria-valuemin="0" aria-valuemax="100">
                        <span style={{ width: `${journey.progression_pourcentage ?? 0}%` }} />
                      </div>
                      {journey.etape_courante && <p><strong>Étape courante :</strong> {journey.etape_courante.titre}</p>}
                    </div>
                    {journeyStages.length ? (
                      <ol className="journey-list">
                        {journeyStages.map((stage) => (
                          <li className={`journey-stage ${stage.statut}`} key={stage.code}>
                            <span className="journey-number">{stage.ordre}</span>
                            <div>
                              <strong>{stage.titre}</strong>
                              <small>{journeyStatusLabels[stage.statut] ?? stage.statut} · {stage.responsable}</small>
                              {stage.date_echeance && <small>Échéance : {formatDate(stage.date_echeance)}</small>}
                              {stage.notes && <p>{stage.notes}</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="empty-records">Le parcours n’est pas encore initialisé.</p>}
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><ShieldCheck size={17} /> Consentements</div>
                    {consentements.length ? (
                      <ul className="record-list">
                        {consentements.map((consentement, index) => (
                          <li key={`${consentement.type}-${index}`}>
                            <span>{consentement.type}</span>
                            <small>{consentement.accepte ? "Accepté" : "Refusé"}{consentement.accepte_at ? ` — ${formatDate(consentement.accepte_at)}` : ""}</small>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="empty-records">Aucun consentement enregistré.</p>}
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><FileText size={17} /> Documents manquants</div>
                    {documentsManquants.length ? (
                      <ul className="record-list">
                        {documentsManquants.map((document, index) => (
                          <li key={`${document.document}-${index}`}>
                            <span>{document.document}</span>
                            <small>{document.statut}</small>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="empty-records">Aucun document manquant.</p>}
                  </div>

                  <div className="dossier-section">
                    <div className="section-label"><ListTodo size={17} /> Tâches ouvertes</div>
                    {tachesOuvertes.length ? (
                      <ul className="record-list">
                        {tachesOuvertes.map((tache, index) => (
                          <li key={`${tache.titre}-${index}`}>
                            <span>{tache.titre}</span>
                            <small>{tache.date_echeance ? formatDate(tache.date_echeance) : tache.statut}</small>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="empty-records">Aucune tâche ouverte.</p>}
                  </div>

                  <div className="next-action">
                    <div className="section-label"><Clock3 size={17} /> Prochaine action</div>
                    <strong>{prochaineAction?.description || prochaineAction?.titre || "Aucune action planifiée"}</strong>
                    {prochaineAction?.date_echeance && (
                      <p>Échéance prévue le {formatDate(prochaineAction.date_echeance)}</p>
                    )}
                  </div>

                  <div className="financing-note">
                    <CircleDollarSign size={17} />
                    <span>Les changements financiers exigent une vérification explicite avant l’enregistrement.</span>
                  </div>
                </div>
              );
            })()}

            <div className="architecture-card">
              <div className="section-label"><ShieldCheck size={17} /> Accès contrôlé</div>
              <ul>
                <li><CheckCircle2 size={15} /> Services PostgreSQL JSON</li>
                <li><CheckCircle2 size={15} /> Isolation par représentant</li>
                <li><CheckCircle2 size={15} /> Aucun UUID affiché</li>
                <li><CheckCircle2 size={15} /> IA locale avec Ollama</li>
              </ul>
            </div>
          </aside>
        </div>
        )}
      </main>
    </div>
  );
}

export default App;
