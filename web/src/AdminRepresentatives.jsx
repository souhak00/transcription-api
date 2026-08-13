import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";

function generateTemporaryPassword() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `Crm!${Array.from(bytes, (value) => value.toString(36)).join("").slice(0, 24)}aA7`;
}

export default function AdminRepresentatives({ identity }) {
  const [accounts, setAccounts] = useState([]);
  const [pending, setPending] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [temporaryCredential, setTemporaryCredential] = useState(null);

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

  async function setEnabled(account) {
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
      const response = await identity.apiFetch(
        `/api/admin/representatives/${account.id}/password`,
        {
          method: "PUT",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ password })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Le mot de passe n’a pas été réinitialisé.");
      setTemporaryCredential({ email: account.email, password });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActionId("");
    }
  }

  return (
    <section className="admin-panel" aria-label="Administration des représentants">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Gestion des accès</p>
          <h2>Comptes représentants</h2>
          <p>Activez les accès ou imposez un nouveau mot de passe temporaire.</p>
        </div>
        <button type="button" onClick={loadAccounts} disabled={pending}>
          <RefreshCw className={pending ? "spin" : ""} size={17} /> Actualiser
        </button>
      </div>

      <div className="admin-security-note">
        <ShieldCheck size={18} />
        <span>Les opérations sont exécutées côté serveur avec un compte Keycloak limité à la gestion des utilisateurs.</span>
      </div>

      {error && <div className="dossier-error" role="alert">{error}</div>}
      {temporaryCredential && (
        <div className="temporary-credential" role="status">
          <strong>Mot de passe temporaire créé pour {temporaryCredential.email}</strong>
          <code>{temporaryCredential.password}</code>
          <span>Copiez-le maintenant. Il devra être remplacé à la première connexion.</span>
        </div>
      )}

      {pending ? (
        <div className="admin-loading"><RefreshCw className="spin" size={18} /> Chargement des comptes…</div>
      ) : (
        <div className="account-list">
          {accounts.map((account) => (
            <article className="account-card" key={account.id}>
              <div className={`account-status ${account.enabled ? "enabled" : "disabled"}`}>
                {account.enabled ? <UserRoundCheck size={20} /> : <UserRoundX size={20} />}
              </div>
              <div className="account-identity">
                <strong>{account.name}</strong>
                <span>{account.email}</span>
                <small>{account.enabled ? "Compte actif" : "Compte désactivé"}</small>
              </div>
              <div className="account-actions">
                <button type="button" onClick={() => resetPassword(account)} disabled={Boolean(actionId)}>
                  <KeyRound size={16} /> Mot de passe temporaire
                </button>
                <button
                  className={account.enabled ? "danger" : "success"}
                  type="button"
                  onClick={() => setEnabled(account)}
                  disabled={Boolean(actionId)}
                >
                  {account.enabled ? <UserRoundX size={16} /> : <UserRoundCheck size={16} />}
                  {account.enabled ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            </article>
          ))}
          {!accounts.length && <p className="admin-empty">Aucun compte représentant rattaché.</p>}
        </div>
      )}
    </section>
  );
}
