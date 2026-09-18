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
            c.statut_depuis,
            c.type_transaction,
            c.revenu_annuel,
            c.date_rappel,
            c.updated_at,
            COALESCE(d.nombre_manquants, 0)::integer AS nombre_documents_manquants,
            COALESCE(d.documents_manquants, ARRAY[]::text[]) AS documents_manquants,
            COALESCE(t.nombre_ouvertes, 0)::integer AS nombre_taches_ouvertes,
            COALESCE(t.nombre_retard, 0)::integer AS nombre_taches_en_retard,
            CASE WHEN prochaine.titre IS NOT NULL THEN jsonb_build_object(
                'titre', prochaine.titre,
                'description', prochaine.description,
                'date_echeance', prochaine.date_echeance
            ) END AS prochaine_action,
            prochaine.date_echeance,
            GREATEST(
                c.updated_at,
                COALESCE(d.derniere_modification, c.updated_at),
                COALESCE(t.derniere_modification, c.updated_at),
                COALESCE(i.derniere_interaction, c.updated_at)
            ) AS date_derniere_activite,
            (
                COALESCE(d.nombre_manquants, 0) * 15
                + COALESCE(t.nombre_ouvertes, 0) * 5
                + COALESCE(t.nombre_retard, 0) * 25
                + CASE WHEN c.date_rappel <= current_date THEN 20 ELSE 0 END
                + CASE WHEN lower(trim(COALESCE(c.statut_dossier, ''))) = 'nouveau' THEN 10 ELSE 0 END
                + CASE WHEN lower(trim(COALESCE(c.statut_dossier, ''))) = 'en analyse'
                    AND current_date - c.statut_depuis::date > 5 THEN 20 ELSE 0 END
            )::integer AS priority_score
        FROM public.clients c
        LEFT JOIN LATERAL (
            SELECT
                count(*) FILTER (
                    WHERE lower(trim(COALESCE(dr.statut, ''))) IN (
                        'a recevoir', 'à recevoir', 'manquant', 'manquante', 'en attente'
                    )
                ) AS nombre_manquants,
                array_agg(dr.document ORDER BY dr.created_at) FILTER (
                    WHERE lower(trim(COALESCE(dr.statut, ''))) IN (
                        'a recevoir', 'à recevoir', 'manquant', 'manquante', 'en attente'
                    )
                ) AS documents_manquants,
                max(dr.created_at) AS derniere_modification
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
                ) AS nombre_retard,
                max(ta.created_at) AS derniere_modification
            FROM public.taches ta
            WHERE ta.client_id = c.client_id
        ) t ON true
        LEFT JOIN LATERAL (
            SELECT ta.titre, ta.description, ta.date_echeance
            FROM public.taches ta
            WHERE ta.client_id = c.client_id
              AND lower(trim(COALESCE(ta.statut, ''))) IN (
                  'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
              )
            ORDER BY
                CASE WHEN ta.date_echeance < current_date THEN 0 ELSE 1 END,
                ta.date_echeance NULLS LAST,
                ta.created_at
            LIMIT 1
        ) prochaine ON true
        LEFT JOIN LATERAL (
            SELECT max(interaction.created_at) AS derniere_interaction
            FROM public.interactions interaction
            WHERE interaction.client_id = c.client_id
        ) i ON true
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
            'nom_client', 'code_client', 'statut_dossier', 'type_transaction',
            'revenu_annuel', 'documents_manquants', 'prochaine_action',
            'date_echeance', 'date_derniere_activite', 'nombre_documents_manquants',
            'nombre_taches_ouvertes', 'nombre_taches_en_retard', 'priority_score'
        ),
        'result_codes', COALESCE(jsonb_agg(t.code_client ORDER BY t.updated_at DESC), '[]'::jsonb),
        'rows', COALESCE(jsonb_agg(
            jsonb_build_object(
                'nom_client', t.nom_client,
                'code_client', t.code_client,
                'statut_dossier', t.statut_dossier,
                'statut_depuis', t.statut_depuis,
                'jours_dans_statut', GREATEST(0, current_date - t.statut_depuis::date),
                'delai_cible_jours', CASE WHEN lower(trim(COALESCE(t.statut_dossier, ''))) = 'en analyse' THEN 5 END,
                'statut_en_retard', CASE WHEN lower(trim(COALESCE(t.statut_dossier, ''))) = 'en analyse'
                    THEN current_date - t.statut_depuis::date > 5 ELSE false END,
                'type_transaction', t.type_transaction,
                'revenu_annuel', t.revenu_annuel,
                'date_rappel', t.date_rappel,
                'nombre_documents_manquants', t.nombre_documents_manquants,
                'documents_manquants', to_jsonb(t.documents_manquants),
                'nombre_taches_ouvertes', t.nombre_taches_ouvertes,
                'nombre_taches_en_retard', t.nombre_taches_en_retard,
                'prochaine_action', t.prochaine_action,
                'date_echeance', t.date_echeance,
                'date_derniere_activite', t.date_derniere_activite,
                'priority_score', t.priority_score,
                'priority_reasons', ARRAY_REMOVE(ARRAY[
                    CASE WHEN t.nombre_taches_en_retard > 0
                        THEN t.nombre_taches_en_retard || ' tâche(s) en retard' END,
                    CASE WHEN t.nombre_documents_manquants > 0
                        THEN t.nombre_documents_manquants || ' document(s) manquant(s)' END,
                    CASE WHEN t.nombre_taches_ouvertes > t.nombre_taches_en_retard
                        THEN (t.nombre_taches_ouvertes - t.nombre_taches_en_retard) || ' tâche(s) ouverte(s)' END,
                    CASE WHEN t.date_rappel <= current_date THEN 'Relance échue' END,
                    CASE WHEN lower(trim(COALESCE(t.statut_dossier, ''))) = 'nouveau'
                        THEN 'Nouveau client à qualifier' END,
                    CASE WHEN lower(trim(COALESCE(t.statut_dossier, ''))) = 'en analyse'
                        AND current_date - t.statut_depuis::date > 5
                        THEN 'Délai d analyse dépassé' END
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
