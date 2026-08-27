-- Minimise le contrat JSON de recherche utilisé par les orchestrateurs.
-- Les coordonnées et les informations du représentant ne sont pas nécessaires
-- pour sélectionner un client et ne doivent pas être exposées au modèle IA.

CREATE OR REPLACE FUNCTION crm.rechercher_clients(p_terme text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'terme_recherche', p_terme,
        'nombre_resultats', COUNT(*),
        'resultats',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'client_id', c.client_id,
                    'nom_client', c.nom_client,
                    'type_transaction', c.type_transaction,
                    'objectif', c.objectif,
                    'statut_dossier', c.statut_dossier
                )
                ORDER BY c.updated_at DESC
            ),
            '[]'::jsonb
        )
    )
    FROM public.clients c
    WHERE NULLIF(BTRIM(p_terme), '') IS NOT NULL
      AND (
            c.nom_client ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.telephone ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.courriel ILIKE '%' || BTRIM(p_terme) || '%'
      );
$function$;

ALTER FUNCTION crm.rechercher_clients(text) OWNER TO crm_service_owner;

ALTER FUNCTION crm.rechercher_clients(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;

REVOKE EXECUTE ON FUNCTION crm.rechercher_clients(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rechercher_clients(text) TO crm_runtime;

COMMENT ON FUNCTION crm.rechercher_clients(text) IS
    'Recherche des clients et retourne un JSON minimisé pour leur sélection.';
