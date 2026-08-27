-- Services métier CRM exposés à n8n et aux autres consommateurs internes.
-- Contrat d'architecture : les consommateurs appellent ces fonctions et ne
-- lisent pas directement les tables du schéma public.

CREATE SCHEMA IF NOT EXISTS crm;

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
                    'telephone', c.telephone,
                    'courriel', c.courriel,
                    'type_transaction', c.type_transaction,
                    'objectif', c.objectif,
                    'statut_dossier', c.statut_dossier,
                    'representant', jsonb_build_object(
                        'representant_id', r.representant_id,
                        'nom_representant', r.nom_representant,
                        'code_representant', r.code_representant
                    )
                )
                ORDER BY c.updated_at DESC
            ),
            '[]'::jsonb
        )
    )
    FROM public.clients c
    JOIN public.representants r
      ON r.representant_id = c.representant_id
    WHERE NULLIF(BTRIM(p_terme), '') IS NOT NULL
      AND (
            c.nom_client ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.telephone ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.courriel ILIKE '%' || BTRIM(p_terme) || '%'
      );
$function$;

CREATE OR REPLACE FUNCTION crm.obtenir_client(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT CASE
        WHEN c.client_id IS NULL THEN
            jsonb_build_object(
                'trouve', false,
                'client_id', p_client_id,
                'client', NULL
            )
        ELSE
            jsonb_build_object(
                'trouve', true,
                'client',
                jsonb_build_object(
                    'client_id', c.client_id,
                    'nom_client', c.nom_client,
                    'telephone', c.telephone,
                    'courriel', c.courriel,
                    'type_emploi', c.type_emploi,
                    'employeur', c.employeur,
                    'revenu_annuel', c.revenu_annuel,
                    'revenu_conjoint', c.revenu_conjoint,
                    'type_transaction', c.type_transaction,
                    'prix_achat', c.prix_achat,
                    'valeur_propriete', c.valeur_propriete,
                    'solde_hypothecaire', c.solde_hypothecaire,
                    'montant_financement', c.montant_financement,
                    'mise_de_fonds', c.mise_de_fonds,
                    'provenance_mise_de_fonds', c.provenance_mise_de_fonds,
                    'dettes_totales', c.dettes_totales,
                    'objectif', c.objectif,
                    'date_rappel', c.date_rappel,
                    'informations_fiscales', c.informations_fiscales,
                    'statut_dossier', c.statut_dossier,
                    'niveau_confiance', c.niveau_confiance,
                    'resume', c.resume,
                    'created_at', c.created_at,
                    'updated_at', c.updated_at,
                    'representant',
                    jsonb_build_object(
                        'representant_id', r.representant_id,
                        'code_representant', r.code_representant,
                        'nom_representant', r.nom_representant,
                        'courriel', r.courriel,
                        'telephone', r.telephone,
                        'equipe', r.equipe,
                        'actif', r.actif
                    )
                )
            )
    END
    FROM (SELECT p_client_id AS identifiant) param
    LEFT JOIN public.clients c ON c.client_id = param.identifiant
    LEFT JOIN public.representants r ON r.representant_id = c.representant_id;
$function$;

CREATE OR REPLACE FUNCTION crm.obtenir_interactions(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'client_id', p_client_id,
        'nombre_interactions', COUNT(i.interaction_id),
        'interactions',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'interaction_id', i.interaction_id,
                    'representant_id', i.representant_id,
                    'date_appel', i.date_appel,
                    'type_interaction', i.type_interaction,
                    'fichier_original_nom', i.fichier_original_nom,
                    'transcription_originale_url', i.transcription_originale_url,
                    'synthese_url', i.synthese_url,
                    'resume', i.resume,
                    'niveau_confiance', i.niveau_confiance,
                    'created_at', i.created_at
                )
                ORDER BY i.date_appel DESC, i.created_at DESC
            ) FILTER (WHERE i.interaction_id IS NOT NULL),
            '[]'::jsonb
        )
    )
    FROM public.interactions i
    WHERE i.client_id = p_client_id;
$function$;

CREATE OR REPLACE FUNCTION crm.obtenir_documents(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'client_id', p_client_id,
        'nombre_documents', COUNT(d.document_id),
        'nombre_documents_manquants',
            COUNT(d.document_id) FILTER (
                WHERE LOWER(COALESCE(d.statut, '')) IN (
                    'a recevoir', 'à recevoir', 'manquant', 'en attente'
                )
            ),
        'documents',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'document_id', d.document_id,
                    'interaction_id', d.interaction_id,
                    'representant_id', d.representant_id,
                    'document', d.document,
                    'statut', d.statut,
                    'date_demande', d.date_demande,
                    'created_at', d.created_at
                )
                ORDER BY d.date_demande DESC, d.created_at DESC
            ) FILTER (WHERE d.document_id IS NOT NULL),
            '[]'::jsonb
        )
    )
    FROM public.documents_requis d
    WHERE d.client_id = p_client_id;
$function$;

CREATE OR REPLACE FUNCTION crm.obtenir_taches(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'client_id', p_client_id,
        'nombre_taches', COUNT(t.tache_id),
        'nombre_taches_ouvertes',
            COUNT(t.tache_id) FILTER (
                WHERE LOWER(COALESCE(t.statut, '')) IN (
                    'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                )
            ),
        'taches',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'tache_id', t.tache_id,
                    'interaction_id', t.interaction_id,
                    'representant_id', t.representant_id,
                    'titre', t.titre,
                    'description', t.description,
                    'date_echeance', t.date_echeance,
                    'statut', t.statut,
                    'created_at', t.created_at
                )
                ORDER BY
                    CASE
                        WHEN LOWER(COALESCE(t.statut, '')) IN (
                            'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                        ) THEN 0
                        ELSE 1
                    END,
                    t.date_echeance ASC NULLS LAST,
                    t.created_at DESC
            ) FILTER (WHERE t.tache_id IS NOT NULL),
            '[]'::jsonb
        )
    )
    FROM public.taches t
    WHERE t.client_id = p_client_id;
$function$;

CREATE OR REPLACE FUNCTION crm.obtenir_etat_dossier(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_client jsonb;
    v_interactions jsonb;
    v_documents jsonb;
    v_taches jsonb;
    v_client_trouve boolean;
    v_statut_dossier text;
    v_nombre_interactions integer;
    v_nombre_documents_manquants integer;
    v_nombre_taches_ouvertes integer;
    v_derniere_interaction jsonb;
    v_documents_manquants jsonb;
    v_taches_ouvertes jsonb;
    v_prochaine_action text;
BEGIN
    v_client := crm.obtenir_client(p_client_id);
    v_client_trouve := COALESCE((v_client ->> 'trouve')::boolean, false);

    IF NOT v_client_trouve THEN
        RETURN jsonb_build_object(
            'trouve', false,
            'client_id', p_client_id,
            'message', 'Aucun client trouvé pour cet identifiant'
        );
    END IF;

    v_interactions := crm.obtenir_interactions(p_client_id);
    v_documents := crm.obtenir_documents(p_client_id);
    v_taches := crm.obtenir_taches(p_client_id);
    v_statut_dossier := COALESCE(v_client #>> '{client,statut_dossier}', 'Non défini');
    v_nombre_interactions := COALESCE((v_interactions ->> 'nombre_interactions')::integer, 0);
    v_nombre_documents_manquants := COALESCE((v_documents ->> 'nombre_documents_manquants')::integer, 0);
    v_nombre_taches_ouvertes := COALESCE((v_taches ->> 'nombre_taches_ouvertes')::integer, 0);
    v_derniere_interaction := COALESCE(v_interactions -> 'interactions' -> 0, 'null'::jsonb);

    SELECT COALESCE(jsonb_agg(document_item), '[]'::jsonb)
    INTO v_documents_manquants
    FROM jsonb_array_elements(COALESCE(v_documents -> 'documents', '[]'::jsonb)) AS document_item
    WHERE LOWER(COALESCE(document_item ->> 'statut', '')) IN (
        'a recevoir', 'à recevoir', 'manquant', 'en attente'
    );

    SELECT COALESCE(jsonb_agg(tache_item), '[]'::jsonb)
    INTO v_taches_ouvertes
    FROM jsonb_array_elements(COALESCE(v_taches -> 'taches', '[]'::jsonb)) AS tache_item
    WHERE LOWER(COALESCE(tache_item ->> 'statut', '')) IN (
        'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
    );

    SELECT tache_item ->> 'description'
    INTO v_prochaine_action
    FROM jsonb_array_elements(v_taches_ouvertes) AS tache_item
    ORDER BY
        NULLIF(tache_item ->> 'date_echeance', '')::date ASC NULLS LAST,
        NULLIF(tache_item ->> 'created_at', '')::timestamptz DESC NULLS LAST
    LIMIT 1;

    IF NULLIF(BTRIM(v_prochaine_action), '') IS NULL THEN
        SELECT tache_item ->> 'titre'
        INTO v_prochaine_action
        FROM jsonb_array_elements(v_taches_ouvertes) AS tache_item
        ORDER BY
            NULLIF(tache_item ->> 'date_echeance', '')::date ASC NULLS LAST,
            NULLIF(tache_item ->> 'created_at', '')::timestamptz DESC NULLS LAST
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'trouve', true,
        'client', v_client -> 'client',
        'etat', v_statut_dossier,
        'resume_dossier',
        jsonb_build_object(
            'nombre_interactions', v_nombre_interactions,
            'nombre_documents_manquants', v_nombre_documents_manquants,
            'nombre_taches_ouvertes', v_nombre_taches_ouvertes
        ),
        'derniere_interaction', v_derniere_interaction,
        'documents_manquants', v_documents_manquants,
        'taches_ouvertes', v_taches_ouvertes,
        'prochaine_action', v_prochaine_action
    );
END;
$function$;

COMMENT ON SCHEMA crm IS 'API interne des services métier CRM.';
COMMENT ON FUNCTION crm.rechercher_clients(text) IS 'Recherche des clients et retourne un contrat JSON.';
COMMENT ON FUNCTION crm.obtenir_client(uuid) IS 'Retourne le profil CRM complet d''un client en JSON.';
COMMENT ON FUNCTION crm.obtenir_interactions(uuid) IS 'Retourne les interactions d''un client en JSON.';
COMMENT ON FUNCTION crm.obtenir_documents(uuid) IS 'Retourne les documents requis d''un client en JSON.';
COMMENT ON FUNCTION crm.obtenir_taches(uuid) IS 'Retourne les tâches d''un client en JSON.';
COMMENT ON FUNCTION crm.obtenir_etat_dossier(uuid) IS 'Compose l''état complet d''un dossier client en JSON.';
