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

const initialMessages = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Bonjour! Je peux retrouver un client, vérifier ses documents, consulter ses tâches ou résumer les dossiers récents. Par quoi souhaitez-vous commencer?"
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
    label: "Documents",
    detail: "Repérer les pièces manquantes",
    action: "documents"
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
    detail: "Afficher la fiche complète",
    action: "dossier"
  }
];

const navItems = [
  { icon: LayoutDashboard, label: "Vue d’ensemble" },
  { icon: MessageSquareText, label: "Assistant", active: true },
  { icon: UsersRound, label: "Clients" },
  { icon: FolderSearch2, label: "Dossiers" }
];

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

function MessageContent({ content }) {
  const lines = String(content).split("\n").filter((line, index, all) => {
    return line.trim() || (index > 0 && index < all.length - 1);
  });

  return (
    <div className="message-copy">
      {lines.map((line, index) => {
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
    </div>
  );
}

function App({ identity }) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [clientReference, setClientReference] = useState("");
  const [dossierResult, setDossierResult] = useState(null);
  const [dossierPending, setDossierPending] = useState(false);
  const [dossierError, setDossierError] = useState("");
  const sessionId = useMemo(createSessionId, []);
  const inputRef = useRef(null);
  const dossierInputRef = useRef(null);
  const dossierRequestIdRef = useRef(0);
  const representativeName = identity.user.name || "Représentant";
  const representativeInitials = getInitials(representativeName);

  async function loadClientDossier(rawReference = clientReference) {
    const reference = rawReference.trim();
    if (!reference) return;
    const requestId = ++dossierRequestIdRef.current;

    setClientReference(reference);
    setDossierPending(true);
    setDossierError("");
    setDossierResult(null);

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
        body: JSON.stringify({ message, sessionId, ...(intent ? { intent } : {}) })
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
          {navItems.map(({ icon: Icon, label, active }) => (
            <button
              className={`nav-item ${active ? "active" : ""}`}
              type="button"
              key={label}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {active && <span className="nav-active-dot" />}
            </button>
          ))}
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
            <p className="eyebrow">Espace conseiller</p>
            <h1>Suivi des clients</h1>
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
                  placeholder="Posez une question sur un client, ses documents ou ses tâches…"
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

              return (
                <div className="dossier-content">
                  <div className="client-summary">
                    <div className="client-initials">{getInitials(dossier.nom_client)}</div>
                    <div>
                      <strong>{dossier.nom_client}</strong>
                      <code>{dossier.code_client}</code>
                    </div>
                  </div>

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
                    <div className="section-label"><BriefcaseBusiness size={17} /> Profil du dossier</div>
                    <dl className="profile-grid">
                      <div><dt>Transaction</dt><dd>{dossier.type_transaction || "Non renseignée"}</dd></div>
                      <div><dt>Emploi</dt><dd>{dossier.type_emploi || "Non renseigné"}</dd></div>
                      <div><dt>Employeur</dt><dd>{dossier.employeur || "Non renseigné"}</dd></div>
                      <div><dt>Revenu annuel</dt><dd>{formatMoney(dossier.revenu_annuel)}</dd></div>
                    </dl>
                    {dossier.objectif && <p className="dossier-summary"><strong>Objectif :</strong> {dossier.objectif}</p>}
                    {dossier.resume && <p className="dossier-summary">{dossier.resume}</p>}
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
                    <span>Les données financières sont affichées en lecture seule.</span>
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
      </main>
    </div>
  );
}

export default App;
