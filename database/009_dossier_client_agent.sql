-- Expose un dossier client complet à l'interface et à l'agent sans UUID.
-- La résolution accepte le code métier ou le nom présent dans la demande.

CREATE OR REPLACE FUNCTION crm.obtenir_dossier_client(p_reference_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH scores AS MATERIALIZED (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            CASE
                WHEN UPPER(COALESCE(p_reference_client, ''))
                        LIKE '%' || c.code_client || '%'
                    THEN 1000
                ELSE (
                    SELECT COUNT(*)
                    FROM regexp_split_to_table(
                        UPPER(COALESCE(c.nom_client, '')),
                        '[^[:alnum:]]+'
                    ) AS mot(valeur)
                    WHERE CHAR_LENGTH(mot.valeur) >= 2
                      AND UPPER(COALESCE(p_reference_client, ''))
                            LIKE '%' || mot.valeur || '%'
                )
            END AS score
        FROM public.clients c
    ),
    correspondances AS MATERIALIZED (
        SELECT
            s.client_id,
            s.code_client,
            s.nom_client,
            COUNT(*) OVER () AS nombre_correspondances
        FROM scores s
        WHERE s.score > 0
          AND s.score = (SELECT MAX(s2.score) FROM scores s2)
    ),
    cible AS MATERIALIZED (
        SELECT c.client_id, c.code_client, c.nom_client
        FROM correspondances c
        WHERE c.nombre_correspondances = 1
    ),
    profil AS MATERIALIZED (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            c.telephone,
            c.courriel,
            c.type_emploi,
            c.employeur,
            c.revenu_annuel,
            c.revenu_conjoint,
            c.type_transaction,
            c.prix_achat,
            c.valeur_propriete,
            c.solde_hypothecaire,
            c.montant_financement,
            c.mise_de_fonds,
            c.provenance_mise_de_fonds,
            c.dettes_totales,
            c.objectif,
            c.date_rappel,
            c.statut_dossier,
            c.statut_depuis,
            c.niveau_confiance,
            c.resume,
            c.created_at,
            c.updated_at
        FROM public.clients c
        JOIN cible x ON x.client_id = c.client_id
    ),
    interactions AS MATERIALIZED (
        SELECT
            COUNT(i.interaction_id) AS nombre_interactions,
            (
                SELECT jsonb_build_object(
                    'date_appel', i2.date_appel,
                    'type_interaction', i2.type_interaction,
                    'resume', i2.resume,
                    'niveau_confiance', i2.niveau_confiance
                )
                FROM public.interactions i2
                JOIN profil p2 ON p2.client_id = i2.client_id
                ORDER BY i2.date_appel DESC, i2.created_at DESC
                LIMIT 1
            ) AS derniere_interaction
        FROM profil p
        LEFT JOIN public.interactions i ON i.client_id = p.client_id
    ),
    documents AS MATERIALIZED (
        SELECT
            COUNT(d.document_id) AS nombre_documents,
            COUNT(d.document_id) FILTER (
                WHERE LOWER(COALESCE(d.statut, '')) IN (
                    'a recevoir', 'à recevoir', 'manquant', 'en attente'
                )
            ) AS nombre_documents_manquants,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'document', d.document,
                        'statut', d.statut,
                        'date_demande', d.date_demande
                    )
                    ORDER BY d.date_demande DESC, d.created_at DESC
                ) FILTER (WHERE d.document_id IS NOT NULL),
                '[]'::jsonb
            ) AS elements
        FROM profil p
        LEFT JOIN public.documents_requis d ON d.client_id = p.client_id
    ),
    taches AS MATERIALIZED (
        SELECT
            COUNT(t.tache_id) AS nombre_taches,
            COUNT(t.tache_id) FILTER (
                WHERE LOWER(COALESCE(t.statut, '')) IN (
                    'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                )
            ) AS nombre_taches_ouvertes,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'titre', t.titre,
                        'description', t.description,
                        'date_echeance', t.date_echeance,
                        'statut', t.statut
                    )
                    ORDER BY
                        CASE
                            WHEN LOWER(COALESCE(t.statut, '')) IN (
                                'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                            ) THEN 0 ELSE 1
                        END,
                        t.date_echeance ASC NULLS LAST,
                        t.created_at DESC
                ) FILTER (WHERE t.tache_id IS NOT NULL),
                '[]'::jsonb
            ) AS elements
        FROM profil p
        LEFT JOIN public.taches t ON t.client_id = p.client_id
    ),
    prochaine_tache AS (
        SELECT jsonb_build_object(
            'titre', t.titre,
            'description', t.description,
            'date_echeance', t.date_echeance,
            'statut', t.statut
        ) AS element
        FROM profil p
        JOIN public.taches t ON t.client_id = p.client_id
        WHERE LOWER(COALESCE(t.statut, '')) IN (
            'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
        )
        ORDER BY t.date_echeance ASC NULLS LAST, t.created_at DESC
        LIMIT 1
    )
    SELECT jsonb_build_object(
        'trouve', EXISTS (SELECT 1 FROM profil),
        'ambigue', (SELECT COUNT(*) FROM correspondances) > 1,
        'nombre_correspondances', (SELECT COUNT(*) FROM correspondances),
        'correspondances', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'code_client', c.code_client,
                        'nom_client', c.nom_client
                    )
                    ORDER BY c.nom_client, c.code_client
                )
                FROM correspondances c
            ),
            '[]'::jsonb
        ),
        'dossier', (
            SELECT jsonb_build_object(
                'code_client', p.code_client,
                'nom_client', p.nom_client,
                'telephone', p.telephone,
                'courriel', p.courriel,
                'type_emploi', p.type_emploi,
                'employeur', p.employeur,
                'revenu_annuel', p.revenu_annuel,
                'revenu_conjoint', p.revenu_conjoint,
                'type_transaction', p.type_transaction,
                'prix_achat', p.prix_achat,
                'valeur_propriete', p.valeur_propriete,
                'solde_hypothecaire', p.solde_hypothecaire,
                'montant_financement', p.montant_financement,
                'mise_de_fonds', p.mise_de_fonds,
                'provenance_mise_de_fonds', p.provenance_mise_de_fonds,
                'dettes_totales', p.dettes_totales,
                'objectif', p.objectif,
                'date_rappel', p.date_rappel,
                'statut_dossier', p.statut_dossier,
                'statut_depuis', p.statut_depuis,
                'jours_dans_statut', GREATEST(0, current_date - p.statut_depuis::date),
                'niveau_confiance', p.niveau_confiance,
                'resume', p.resume,
                'created_at', p.created_at,
                'updated_at', p.updated_at,
                'resume_dossier', jsonb_build_object(
                    'nombre_interactions', COALESCE(i.nombre_interactions, 0),
                    'nombre_documents', COALESCE(d.nombre_documents, 0),
                    'nombre_documents_manquants',
                        COALESCE(d.nombre_documents_manquants, 0),
                    'nombre_taches', COALESCE(t.nombre_taches, 0),
                    'nombre_taches_ouvertes',
                        COALESCE(t.nombre_taches_ouvertes, 0)
                ),
                'derniere_interaction', i.derniere_interaction,
                'documents', COALESCE(d.elements, '[]'::jsonb),
                'taches', COALESCE(t.elements, '[]'::jsonb),
                'prochaine_action', (SELECT pt.element FROM prochaine_tache pt)
            )
            FROM profil p
            CROSS JOIN interactions i
            CROSS JOIN documents d
            CROSS JOIN taches t
        )
    );
$function$;

ALTER FUNCTION crm.obtenir_dossier_client(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_dossier_client(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_dossier_client(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_dossier_client(text) TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_dossier_client(text) IS
    'Retourne le dossier client visible par code métier ou nom, sans UUID.';
