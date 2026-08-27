-- Service de consultation des dix clients les plus récemment créés.
-- Le résultat est filtré par les politiques RLS selon le contexte applicatif.

CREATE OR REPLACE FUNCTION crm.obtenir_derniers_clients()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH derniers AS (
        SELECT
            c.client_id,
            c.nom_client,
            c.type_transaction,
            c.statut_dossier,
            c.created_at
        FROM public.clients c
        ORDER BY c.created_at DESC, c.client_id DESC
        LIMIT 10
    )
    SELECT jsonb_build_object(
        'limite', 10,
        'nombre_resultats', COUNT(*),
        'clients',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'nom_client', d.nom_client,
                    'type_transaction', d.type_transaction,
                    'statut_dossier', d.statut_dossier,
                    'created_at', d.created_at
                )
                ORDER BY d.created_at DESC, d.client_id DESC
            ),
            '[]'::jsonb
        )
    )
    FROM derniers d;
$function$;

ALTER FUNCTION crm.obtenir_derniers_clients() OWNER TO crm_service_owner;

ALTER FUNCTION crm.obtenir_derniers_clients()
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;

REVOKE EXECUTE ON FUNCTION crm.obtenir_derniers_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_derniers_clients() TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_derniers_clients() IS
    'Retourne en JSON les dix clients visibles les plus récemment créés.';
