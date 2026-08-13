-- Service de consultation des clients qui ont encore des documents à fournir.
-- La visibilité reste contrôlée par la RLS et le contexte applicatif.

CREATE OR REPLACE FUNCTION crm.obtenir_clients_documents_manquants(
    p_limite integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH documents_manquants AS (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            c.statut_dossier,
            c.updated_at,
            d.document,
            d.statut,
            d.date_demande,
            d.document_id
        FROM public.clients c
        JOIN public.documents_requis d ON d.client_id = c.client_id
        WHERE lower(trim(coalesce(d.statut, ''))) IN (
            'a recevoir', 'à recevoir', 'manquant', 'manquante', 'en attente'
        )
    ),
    clients_agreges AS (
        SELECT
            dm.client_id,
            dm.code_client,
            dm.nom_client,
            dm.statut_dossier,
            dm.updated_at,
            count(*)::integer AS nombre_documents_manquants,
            jsonb_agg(
                jsonb_build_object(
                    'document', dm.document,
                    'statut', dm.statut,
                    'date_demande', dm.date_demande
                )
                ORDER BY dm.date_demande ASC NULLS LAST, dm.document, dm.document_id
            ) AS documents_manquants
        FROM documents_manquants dm
        GROUP BY
            dm.client_id,
            dm.code_client,
            dm.nom_client,
            dm.statut_dossier,
            dm.updated_at
    ),
    clients_limites AS (
        SELECT *
        FROM clients_agreges
        ORDER BY nombre_documents_manquants DESC, updated_at DESC, client_id
        LIMIT greatest(1, least(coalesce(p_limite, 20), 100))
    )
    SELECT jsonb_build_object(
        'limite', greatest(1, least(coalesce(p_limite, 20), 100)),
        'nombre_clients', count(*),
        'clients', coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'code_client', cl.code_client,
                    'nom_client', cl.nom_client,
                    'statut_dossier', cl.statut_dossier,
                    'nombre_documents_manquants', cl.nombre_documents_manquants,
                    'documents_manquants', cl.documents_manquants
                )
                ORDER BY cl.nombre_documents_manquants DESC, cl.updated_at DESC, cl.client_id
            ),
            '[]'::jsonb
        )
    )
    FROM clients_limites cl;
$function$;

ALTER FUNCTION crm.obtenir_clients_documents_manquants(integer)
    OWNER TO crm_service_owner;

ALTER FUNCTION crm.obtenir_clients_documents_manquants(integer)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;

REVOKE EXECUTE ON FUNCTION crm.obtenir_clients_documents_manquants(integer)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_clients_documents_manquants(integer)
    TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_clients_documents_manquants(integer) IS
    'Retourne les clients visibles qui ont des documents manquants, sans UUID.';
