-- Sépare le compte d'administration PostgreSQL du compte utilisé à l'exécution.
-- Cette migration doit être appliquée par un administrateur de la base.
-- Le mot de passe de crm_runtime doit être injecté hors dépôt.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_service_owner') THEN
        CREATE ROLE crm_service_owner
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOBYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_runtime') THEN
        CREATE ROLE crm_runtime
            LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            NOBYPASSRLS;
    END IF;
END
$roles$;

ALTER ROLE crm_service_owner
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

ALTER ROLE crm_runtime
    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

GRANT USAGE ON SCHEMA crm TO crm_service_owner;
GRANT SELECT ON TABLE
    public.clients,
    public.representants,
    public.interactions,
    public.documents_requis,
    public.taches
TO crm_service_owner;

ALTER FUNCTION crm.rechercher_clients(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_client(uuid) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_interactions(uuid) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_documents(uuid) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_taches(uuid) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_etat_dossier(uuid) OWNER TO crm_service_owner;

ALTER FUNCTION crm.rechercher_clients(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.obtenir_client(uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.obtenir_interactions(uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.obtenir_documents(uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.obtenir_taches(uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.obtenir_etat_dossier(uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM crm_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA crm FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA crm FROM crm_runtime;

GRANT USAGE ON SCHEMA crm TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.rechercher_clients(text) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.obtenir_client(uuid) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.obtenir_interactions(uuid) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.obtenir_documents(uuid) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.obtenir_taches(uuid) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.obtenir_etat_dossier(uuid) TO crm_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE crm_service_owner IN SCHEMA crm
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMENT ON ROLE crm_service_owner IS
    'Propriétaire non connecté des services CRM; soumis aux politiques RLS.';
COMMENT ON ROLE crm_runtime IS
    'Compte technique minimal de l’API et de n8n; accès limité aux fonctions crm.*.';

-- Configuration requise au déploiement, à exécuter avec un secret non versionné :
-- ALTER ROLE crm_runtime PASSWORD '<secret-géré-hors-dépôt>';
--
-- Chaque transaction applicative doit définir le contexte authentifié avant
-- l'appel aux services :
-- SELECT set_config('app.role', 'representant', true);
-- SELECT set_config('app.representant_id', '<uuid-authentifié>', true);
-- SELECT crm.rechercher_clients('Tremblay');
