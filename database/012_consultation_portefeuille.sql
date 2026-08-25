-- Consultation deterministe du portefeuille visible par le representant.
-- Les filtres et tris sont limites a une liste blanche par cette fonction.

CREATE OR REPLACE FUNCTION crm.consulter_portefeuille(
    p_filters jsonb DEFAULT '{}'::jsonb,
    p_sort jsonb DEFAULT '[]'::jsonb,
    p_limite integer DEFAULT 20,
    p_selection_codes text[] DEFAULT NULL,
    p_aggregate jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH candidats AS MATERIALIZED (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            c.statut_dossier,
            c.revenu_annuel,
            c.date_rappel,
            c.updated_at,
            COALESCE(d.nombre_manquants, 0)::integer AS nombre_documents_manquants,
            COALESCE(t.nombre_ouvertes, 0)::integer AS nombre_taches_ouvertes,
            COALESCE(t.nombre_retard, 0)::integer AS nombre_taches_en_retard,
            (
                COALESCE(d.nombre_manquants, 0) * 15
                + COALESCE(t.nombre_ouvertes, 0) * 5
                + COALESCE(t.nombre_retard, 0) * 25
                + CASE WHEN c.date_rappel <= current_date THEN 20 ELSE 0 END
            )::integer AS priority_score
        FROM public.clients c
        LEFT JOIN LATERAL (
            SELECT count(*) FILTER (
                WHERE lower(trim(COALESCE(dr.statut, ''))) IN (
                    'a recevoir', 'à recevoir', 'manquant', 'manquante', 'en attente'
                )
            ) AS nombre_manquants
            FROM public.documents_requis dr
            WHERE dr.client_id = c.client_id
        ) d ON true
        LEFT JOIN LATERAL (
            SELECT
                count(*) FILTER (
                    WHERE lower(trim(COALESCE(ta.statut, ''))) IN (
                        'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                    )
                ) AS nombre_ouvertes,
                count(*) FILTER (
                    WHERE lower(trim(COALESCE(ta.statut, ''))) IN (
                        'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                    ) AND ta.date_echeance < current_date
                ) AS nombre_retard
            FROM public.taches ta
            WHERE ta.client_id = c.client_id
        ) t ON true
        WHERE (
            p_selection_codes IS NULL
            OR cardinality(p_selection_codes) = 0
            OR c.code_client = ANY(p_selection_codes)
        )
          AND (
            COALESCE(p_filters ->> 'statut', '') = ''
            OR translate(
                lower(trim(c.statut_dossier)),
                'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
                'aaaaaaceeeeiiiinooooouuuuyy'
            ) = translate(
                lower(trim(p_filters ->> 'statut')),
                'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
                'aaaaaaceeeeiiiinooooouuuuyy'
            )
          )
          AND (
            COALESCE((p_filters ->> 'a_relancer')::boolean, false) = false
            OR c.date_rappel <= current_date
            OR EXISTS (
                SELECT 1 FROM public.taches tr
                WHERE tr.client_id = c.client_id
                  AND tr.date_echeance < current_date
                  AND lower(trim(COALESCE(tr.statut, ''))) IN (
                      'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                  )
            )
          )
    ),
    tries AS MATERIALIZED (
        SELECT c.*
        FROM candidats c
        ORDER BY
            CASE WHEN p_aggregate ->> 'field' = 'revenu_annuel'
                AND p_aggregate ->> 'operation' = 'max' THEN c.revenu_annuel END DESC NULLS LAST,
            CASE WHEN p_sort #>> '{0,field}' = 'priority_score'
                AND p_sort #>> '{0,direction}' = 'desc' THEN c.priority_score END DESC,
            CASE WHEN p_sort #>> '{0,field}' = 'updated_at'
                AND p_sort #>> '{0,direction}' = 'desc' THEN c.updated_at END DESC,
            c.updated_at DESC,
            c.code_client
        LIMIT CASE
            WHEN p_aggregate IS NOT NULL THEN 1
            ELSE greatest(1, least(COALESCE(p_limite, 20), 100))
        END
    )
    SELECT jsonb_build_object(
        'scope', CASE WHEN cardinality(p_selection_codes) > 0 THEN 'selection' ELSE 'portfolio' END,
        'nombre_clients', count(*),
        'aggregate', p_aggregate,
        'columns', jsonb_build_array(
            'nom_client', 'code_client', 'statut_dossier', 'revenu_annuel',
            'nombre_documents_manquants', 'nombre_taches_ouvertes',
            'nombre_taches_en_retard', 'priority_score'
        ),
        'result_codes', COALESCE(jsonb_agg(t.code_client ORDER BY t.updated_at DESC), '[]'::jsonb),
        'rows', COALESCE(jsonb_agg(
            jsonb_build_object(
                'nom_client', t.nom_client,
                'code_client', t.code_client,
                'statut_dossier', t.statut_dossier,
                'revenu_annuel', t.revenu_annuel,
                'date_rappel', t.date_rappel,
                'nombre_documents_manquants', t.nombre_documents_manquants,
                'nombre_taches_ouvertes', t.nombre_taches_ouvertes,
                'nombre_taches_en_retard', t.nombre_taches_en_retard,
                'priority_score', t.priority_score,
                'priority_reasons', ARRAY_REMOVE(ARRAY[
                    CASE WHEN t.nombre_taches_en_retard > 0
                        THEN t.nombre_taches_en_retard || ' tâche(s) en retard' END,
                    CASE WHEN t.nombre_documents_manquants > 0
                        THEN t.nombre_documents_manquants || ' document(s) manquant(s)' END,
                    CASE WHEN t.date_rappel <= current_date THEN 'Relance échue' END
                ], NULL)
            ) ORDER BY
                CASE WHEN p_sort #>> '{0,field}' = 'priority_score' THEN t.priority_score END DESC,
                t.updated_at DESC
        ), '[]'::jsonb)
    )
    FROM tries t;
$function$;

ALTER FUNCTION crm.consulter_portefeuille(jsonb, jsonb, integer, text[], jsonb)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.consulter_portefeuille(jsonb, jsonb, integer, text[], jsonb)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.consulter_portefeuille(jsonb, jsonb, integer, text[], jsonb)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.consulter_portefeuille(jsonb, jsonb, integer, text[], jsonb)
    TO crm_runtime;

COMMENT ON FUNCTION crm.consulter_portefeuille(jsonb, jsonb, integer, text[], jsonb) IS
    'Filtre, classe et agrège le portefeuille visible sans exposer les UUID.';
