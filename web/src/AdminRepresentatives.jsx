import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Copy, KeyRound, LogOut, RefreshCw, Search, ShieldCheck,
  UserPlus, UserRoundCheck, UserRoundX, UsersRound, X
} from "lucide-react";

function generateTemporaryPassword() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `Crm!${Array.from(bytes, (value) => value.toString(36)).join("").slice(0, 24)}aA7`;
}

function accountStatus(account) {
  if (!account.enabled) return { label: "Suspendu", tone: "disabled" };
  if (account.requiredActions?.includes("UPDATE_PASSWORD")) {
    return { label: "Invitation en attente", tone: "pending" };
  }
  return { label: "Actif", tone: "enabled" };
}

function formatCreatedAt(value) {
  if (!value) return "Date non disponible";
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric", month: "short", year: "numeric"
  }).format(new Date(value));
}

const EMPTY_FORM = { name: "", email: "", representantId: "" };

export default function AdminRepresentatives({ identity }) {
  const [accounts, setAccounts] = useState([]);
  const [pending, setPending] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [temporaryCredential, setTemporaryCredential] = useState(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [copied, setCopied] = useState(false);

  async function loadAccounts() {
    setPending(true);
    setError("");
    try {
      const response = await identity.apiFetch("/api/admin/representatives", {
        headers: { accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Les comptes sont indisponibles.");
      setAccounts(payload.accounts ?? []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => { loadAccounts(); }, []);

  const stats = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((account) => account.enabled).length,
    suspended: accounts.filter((account) => !account.enabled).length,
    pending: accounts.filter((account) =>
      account.enabled && account.requiredActions?.includes("UPDATE_PASSWORD")
    ).length
  }), [accounts]);

  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter((account) => [account.name, account.email, account.representantId]
      .some((value) => String(value ?? "").toLowerCase().includes(normalized)));
  }, [accounts, query]);

  async function setEnabled(account) {
    if (account.enabled && !globalThis.confirm(
      `Suspendre l’accès de ${account.name}? Ses sessions existantes devront aussi être révoquées.`
    )) return;
    setActionId(account.id);
    setError("");
    setTemporaryCredential(null);
    try {
      const response = await identity.apiFetch(`/api/admin/representatives/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ enabled: !account.enabled })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Le statut n’a pas été modifié.");
      setAccounts((current) => current.map((item) =>
        item.id === account.id ? { ...item, enabled: !item.enabled } : item
      ));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionId("");
    }
  }

  async function resetPassword(account) {
    const password = generateTemporaryPassword();
    setActionId(account.id);
    setError("");
    setTemporaryCredential(null);
    try {
      const response = await identity.apiFetch(`/api/admin/representatives/${account.id}/password`, {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Le mot de passe n’a pas été réinitialisé.");
      setTemporaryCredential({ email: account.email, password });
      setCopied(false);
      setAccounts((current) => current.map((item) => item.id === account.id
        ? { ...item, requiredActions: ["UPDATE_PASSWORD"] }
        : item));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionId("");
    }
  }

  async function revokeSessions(account) {
    if (!globalThis.confirm(`Déconnecter ${account.name} de tous ses appareils?`)) return;
    setActionId(account.id);
    setError("");
    try {
      const response = await identity.apiFetch(`/api/admin/representatives/${account.id}/sessions`, {
        method: "DELETE", headers: { accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Les sessions n’ont pas été révoquées.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionId("");
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    setCreatePending(true);
    setError("");
    setTemporaryCredential(null);
    try {
      const response = await identity.apiFetch("/api/admin/representatives", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Le compte n’a pas été créé.");
      setAccounts((current) => [payload.account, ...current]);
      setTemporaryCredential({ email: payload.account.email, password: payload.temporaryPassword });
      setCopied(false);
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreatePending(false);
    }
  }

  async function copyPassword() {
    if (!temporaryCredential) return;
    await navigator.clipboard.writeText(temporaryCredential.password);
    setCopied(true);
  }

  return (
    <section className="admin-panel" aria-label="Administration des représentants">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Gestion des accès</p>
          <h2>Comptes représentants</h2>
          <p>Créez les accès, surveillez leur état et intervenez sans quitter le CRM.</p>
        </div>
        <div className="admin-heading-actions">
          <button type="button" onClick={loadAccounts} disabled={pending}>
            <RefreshCw className={pending ? "spin" : ""} size={17} /> Actualiser
          </button>
          <button className="admin-primary-button" type="button" onClick={() => setShowCreate(true)}>
            <UserPlus size={17} /> Nouveau représentant
          </button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <article><UsersRound size={18} /><span>Total</span><strong>{stats.total}</strong></article>
        <article><UserRoundCheck size={18} /><span>Actifs</span><strong>{stats.active}</strong></article>
        <article><KeyRound size={18} /><span>Invitations</span><strong>{stats.pending}</strong></article>
        <article><UserRoundX size={18} /><span>Suspendus</span><strong>{stats.suspended}</strong></article>
      </div>

      <div className="admin-security-note">
        <ShieldCheck size={18} />
        <span>Les opérations sont exécutées côté serveur avec un compte Keycloak limité à la gestion des utilisateurs.</span>
      </div>

      {error && <div className="dossier-error" role="alert">{error}</div>}
      {temporaryCredential && (
        <div className="temporary-credential" role="status">
          <div>
            <strong>Mot de passe temporaire créé pour {temporaryCredential.email}</strong>
            <span>Copiez-le maintenant. Il devra être remplacé à la première connexion.</span>
          </div>
          <code>{temporaryCredential.password}</code>
          <button type="button" onClick={copyPassword}>
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      )}

      <label className="admin-search">
        <Search size={17} />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher par nom, courriel ou identifiant CRM" />
      </label>

      {pending ? (
        <div className="admin-loading"><RefreshCw className="spin" size={18} /> Chargement des comptes…</div>
      ) : (
        <div className="account-list">
          {filteredAccounts.map((account) => {
            const status = accountStatus(account);
            return (
              <article className="account-card" key={account.id}>
                <div className={`account-status ${status.tone}`}>
                  {account.enabled ? <UserRoundCheck size={20} /> : <UserRoundX size={20} />}
                </div>
                <div className="account-identity">
                  <strong>{account.name}</strong>
                  <span>{account.email}</span>
                  <div className="account-meta">
                    <small className={`account-state ${status.tone}`}>{status.label}</small>
                    <small>Créé le {formatCreatedAt(account.createdAt)}</small>
                    <small title={account.representantId}>CRM : {account.representantId || "non rattaché"}</small>
                  </div>
                </div>
                <div className="account-actions">
                  <button type="button" onClick={() => resetPassword(account)} disabled={Boolean(actionId)}><KeyRound size={16} /> Mot de passe</button>
                  <button type="button" onClick={() => revokeSessions(account)} disabled={Boolean(actionId)}><LogOut size={16} /> Déconnecter</button>
                  <button className={account.enabled ? "danger" : "success"} type="button"
                    onClick={() => setEnabled(account)} disabled={Boolean(actionId)}>
                    {account.enabled ? <UserRoundX size={16} /> : <UserRoundCheck size={16} />}
                    {account.enabled ? "Suspendre" : "Réactiver"}
                  </button>
                </div>
              </article>
            );
          })}
          {!filteredAccounts.length && <p className="admin-empty">Aucun compte ne correspond à la recherche.</p>}
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <form className="admin-create-modal" onSubmit={createAccount}>
            <div className="admin-create-heading">
              <div><p className="eyebrow">Nouvel accès</p><h3>Créer un représentant</h3></div>
              <button type="button" aria-label="Fermer" onClick={() => setShowCreate(false)}><X size={20} /></button>
            </div>
            <p className="admin-create-help">Le profil métier doit déjà exister dans le CRM. Son identifiant UUID assure l’isolation de son portefeuille.</p>
            <label><span>Nom complet</span><input required minLength="2" maxLength="120" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Marie-Pier Mercier" /></label>
            <label><span>Courriel professionnel</span><input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="representant@entreprise.ca" /></label>
            <label><span>Identifiant du représentant CRM</span><input required pattern="[0-9a-fA-F-]{36}" value={form.representantId} onChange={(event) => setForm((current) => ({ ...current, representantId: event.target.value }))} placeholder="00000000-0000-4000-8000-000000000000" /></label>
            <div className="admin-create-note"><ShieldCheck size={17} /> Un mot de passe temporaire fort sera généré côté serveur.</div>
            <div className="admin-create-actions">
              <button type="button" onClick={() => setShowCreate(false)}>Annuler</button>
              <button className="admin-primary-button" type="submit" disabled={createPending}>
                {createPending ? <RefreshCw className="spin" size={16} /> : <UserPlus size={16} />}
                {createPending ? "Création…" : "Créer l’accès"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
