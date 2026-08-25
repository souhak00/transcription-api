-- Parcours metier d'un dossier hypothecaire, du premier contact au suivi post-transaction.
-- Les etapes sont structurees et modifiables sans exposer les UUID dans les services JSON.

CREATE TABLE IF NOT EXISTS crm.etapes_parcours_hypothecaire (
    etape_code text PRIMARY KEY,
    ordre smallint NOT NULL UNIQUE CHECK (ordre BETWEEN 1 AND 11),
    titre text NOT NULL,
    description text NOT NULL,
    responsable_defaut text NOT NULL,
    est_optionnelle boolean NOT NULL DEFAULT false
);

ALTER TABLE crm.etapes_parcours_hypothecaire OWNER TO crm_service_owner;

INSERT INTO crm.etapes_parcours_hypothecaire (
    etape_code, ordre, titre, description, responsable_defaut, est_optionnelle
) VALUES
    ('prise_mandat', 1, 'Premier contact et prise de mandat', 'Expliquer le rôle, la rémunération, les divulgations et formaliser le mandat lorsque requis.', 'courtier_hypothecaire', true),
    ('analyse_projet', 2, 'Analyse de la situation et du projet', 'Recueillir le projet, les revenus, les dettes, le crédit, la mise de fonds et les préférences.', 'courtier_hypothecaire', false),
    ('prequalification', 3, 'Préqualification ou préautorisation', 'Établir la capacité d’emprunt et obtenir une préqualification ou une préautorisation.', 'courtier_hypothecaire', false),
    ('recherche_propriete', 4, 'Recherche de propriété', 'Valider le budget et ajuster le scénario de financement pendant la recherche.', 'client_courtier_immobilier', true),
    ('promesse_achat', 5, 'Promesse d’achat et condition de financement', 'Consigner la promesse acceptée, la propriété, le prix, la mise de fonds et le délai de financement.', 'client', false),
    ('montage_soumission', 6, 'Montage et soumission du dossier', 'Compléter les pièces justificatives et transmettre le dossier aux prêteurs appropriés.', 'courtier_hypothecaire', false),
    ('comparaison_options', 7, 'Présentation des options et recommandation', 'Comparer les taux, termes, pénalités, remboursements anticipés et coûts totaux.', 'courtier_hypothecaire', false),
    ('approbation_finale', 8, 'Approbation finale du prêteur', 'Obtenir l’engagement ferme et satisfaire les conditions, notamment l’évaluation et l’assurance.', 'preteur_courtier', false),
    ('coordination_notaire', 9, 'Coordination avec le notaire', 'Transmettre les instructions et vérifier que les conditions de signature sont remplies.', 'courtier_notaire', false),
    ('signature_decaissement', 10, 'Signature et déblocage des fonds', 'Confirmer la signature, l’inscription de l’hypothèque et le décaissement.', 'notaire', false),
    ('suivi_post_transaction', 11, 'Suivi post-transaction', 'Planifier le suivi de satisfaction, le renouvellement et les futurs besoins de financement.', 'courtier_hypothecaire', true)
ON CONFLICT (etape_code) DO UPDATE SET
    ordre = EXCLUDED.ordre,
    titre = EXCLUDED.titre,
    description = EXCLUDED.description,
    responsable_defaut = EXCLUDED.responsable_defaut,
    est_optionnelle = EXCLUDED.est_optionnelle;

CREATE TABLE IF NOT EXISTS public.suivi_parcours_hypothecaire (
    dossier_id uuid NOT NULL,
    representant_id uuid NOT NULL,
    etape_code text NOT NULL REFERENCES crm.etapes_parcours_hypothecaire(etape_code),
    statut text NOT NULL DEFAULT 'a_faire' CHECK (
        statut IN ('a_faire', 'en_cours', 'bloquee', 'complete', 'non_applicable')
    ),
    responsable text NOT NULL,
    date_debut date,
    date_echeance date,
    date_completion date,
    notes text,
    conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dossier_id, etape_code),
    CONSTRAINT fk_suivi_parcours_dossier_representant
        FOREIGN KEY (dossier_id, representant_id)
        REFERENCES public.dossiers_hypothecaires(dossier_id, representant_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_suivi_parcours_dates CHECK (
        date_completion IS NULL OR statut = 'complete'
    )
);

CREATE INDEX IF NOT EXISTS ix_suivi_parcours_representant
    ON public.suivi_parcours_hypothecaire(representant_id, statut, date_echeance);

ALTER TABLE public.suivi_parcours_hypothecaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suivi_parcours_hypothecaire FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suivi_parcours_access_policy ON public.suivi_parcours_hypothecaire;
CREATE POLICY suivi_parcours_access_policy
ON public.suivi_parcours_hypothecaire
USING (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
)
WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
);

GRANT SELECT ON crm.etapes_parcours_hypothecaire TO crm_service_owner;
GRANT SELECT, INSERT, UPDATE ON public.suivi_parcours_hypothecaire TO crm_service_owner;

-- Initialise les dossiers existants. Les indices existants servent uniquement a proposer
-- un point de depart; le courtier garde le controle des statuts par la suite.
INSERT INTO public.suivi_parcours_hypothecaire (
    dossier_id, representant_id, etape_code, statut, responsable,
    date_debut, date_completion
)
SELECT
    d.dossier_id,
    d.representant_id,
    e.etape_code,
    CASE e.ordre
        WHEN 1 THEN 'complete'
        WHEN 2 THEN CASE
            WHEN d.type_transaction IS NOT NULL OR h.type_propriete IS NOT NULL
                OR h.montant_requis IS NOT NULL THEN 'complete'
            ELSE 'en_cours' END
        WHEN 3 THEN CASE
            WHEN lower(coalesce(h.statut_approbation, d.statut_dossier, ''))
                    ~ '(pre.?appr|pré.?appr|approuv)' THEN 'complete'
            ELSE 'a_faire' END
        WHEN 4 THEN CASE
            WHEN lower(coalesce(d.type_transaction, '')) ~ '(refinancement|renouvellement)'
                THEN 'non_applicable'
            WHEN h.prix_achat IS NOT NULL THEN 'complete'
            ELSE 'a_faire' END
        WHEN 5 THEN CASE WHEN h.prix_achat IS NOT NULL THEN 'complete' ELSE 'a_faire' END
        WHEN 6 THEN CASE WHEN h.preteur IS NOT NULL THEN 'complete' ELSE 'a_faire' END
        WHEN 7 THEN CASE
            WHEN h.preteur IS NOT NULL AND h.taux_interet IS NOT NULL THEN 'complete'
            ELSE 'a_faire' END
        WHEN 8 THEN CASE
            WHEN lower(coalesce(h.statut_approbation, '')) ~ '(final|ferme|approuv)'
                THEN 'complete'
            ELSE 'a_faire' END
        WHEN 9 THEN CASE
            WHEN h.notaire_nom IS NOT NULL OR h.instructions_notaire_date IS NOT NULL
                THEN 'complete'
            ELSE 'a_faire' END
        WHEN 10 THEN CASE
            WHEN coalesce(h.date_decaissement, h.date_fermeture) <= current_date
                THEN 'complete'
            ELSE 'a_faire' END
        WHEN 11 THEN CASE
            WHEN coalesce(h.date_decaissement, h.date_fermeture) <= current_date
                THEN 'en_cours'
            ELSE 'a_faire' END
    END,
    e.responsable_defaut,
    CASE WHEN e.ordre = 1 THEN d.created_at::date END,
    CASE WHEN e.ordre = 1 THEN d.created_at::date END
FROM public.dossiers_hypothecaires d
CROSS JOIN crm.etapes_parcours_hypothecaire e
LEFT JOIN public.details_hypothecaires h ON h.dossier_id = d.dossier_id
ON CONFLICT (dossier_id, etape_code) DO NOTHING;

CREATE OR REPLACE FUNCTION crm.initialiser_parcours_hypothecaire()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO public.suivi_parcours_hypothecaire (
        dossier_id, representant_id, etape_code, statut, responsable,
        date_debut, date_completion
    )
    SELECT
        NEW.dossier_id,
        NEW.representant_id,
        e.etape_code,
        CASE WHEN e.ordre = 1 THEN 'en_cours' ELSE 'a_faire' END,
        e.responsable_defaut,
        CASE WHEN e.ordre = 1 THEN current_date END,
        NULL
    FROM crm.etapes_parcours_hypothecaire e
    ON CONFLICT (dossier_id, etape_code) DO NOTHING;
    RETURN NEW;
END;
$function$;

ALTER FUNCTION crm.initialiser_parcours_hypothecaire() OWNER TO crm_service_owner;
REVOKE EXECUTE ON FUNCTION crm.initialiser_parcours_hypothecaire() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_initialiser_parcours_hypothecaire
    ON public.dossiers_hypothecaires;
CREATE TRIGGER trg_initialiser_parcours_hypothecaire
AFTER INSERT ON public.dossiers_hypothecaires
FOR EACH ROW EXECUTE FUNCTION crm.initialiser_parcours_hypothecaire();

CREATE OR REPLACE FUNCTION crm.obtenir_parcours_dossier(p_reference_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH cible AS MATERIALIZED (
        SELECT d.dossier_id, d.code_dossier
        FROM public.clients c
        JOIN public.dossier_clients dc ON dc.client_id = c.client_id
        JOIN public.dossiers_hypothecaires d ON d.dossier_id = dc.dossier_id
        WHERE c.code_client = upper(trim(p_reference_client))
        ORDER BY dc.est_principal DESC, d.updated_at DESC
        LIMIT 1
    ),
    lignes AS MATERIALIZED (
        SELECT
            e.ordre,
            e.etape_code,
            e.titre,
            e.description,
            e.est_optionnelle,
            s.statut,
            s.responsable,
            s.date_debut,
            s.date_echeance,
            s.date_completion,
            s.notes,
            s.conditions,
            s.updated_at
        FROM cible c
        JOIN public.suivi_parcours_hypothecaire s ON s.dossier_id = c.dossier_id
        JOIN crm.etapes_parcours_hypothecaire e ON e.etape_code = s.etape_code
    ),
    prochaine AS (
        SELECT l.*
        FROM lignes l
        WHERE l.statut NOT IN ('complete', 'non_applicable')
        ORDER BY CASE l.statut WHEN 'bloquee' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END,
                 l.ordre
        LIMIT 1
    )
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cible) THEN NULL ELSE jsonb_build_object(
        'code_dossier', (SELECT code_dossier FROM cible),
        'progression_pourcentage', COALESCE((
            SELECT round(100.0 * count(*) FILTER (WHERE statut = 'complete')
                / NULLIF(count(*) FILTER (WHERE statut <> 'non_applicable'), 0))::integer
            FROM lignes
        ), 0),
        'etape_courante', COALESCE((
            SELECT jsonb_build_object(
                'ordre', ordre, 'code', etape_code, 'titre', titre,
                'statut', statut, 'responsable', responsable,
                'date_echeance', date_echeance
            ) FROM prochaine
        ), 'null'::jsonb),
        'etapes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'ordre', ordre,
                'code', etape_code,
                'titre', titre,
                'description', description,
                'optionnelle', est_optionnelle,
                'statut', statut,
                'responsable', responsable,
                'date_debut', date_debut,
                'date_echeance', date_echeance,
                'date_completion', date_completion,
                'notes', notes,
                'conditions', conditions,
                'updated_at', updated_at
            ) ORDER BY ordre) FROM lignes
        ), '[]'::jsonb)
    ) END;
$function$;

ALTER FUNCTION crm.obtenir_parcours_dossier(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_parcours_dossier(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_parcours_dossier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_parcours_dossier(text) TO crm_runtime;

-- Enrichit la consultation existante sans changer son contrat de transport n8n.
CREATE OR REPLACE FUNCTION crm.obtenir_dossier_hypothecaire(p_reference_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH base AS MATERIALIZED (
        SELECT crm.obtenir_dossier_hypothecaire_legacy(p_reference_client) AS resultat
    ),
    client_cible AS MATERIALIZED (
        SELECT c.client_id, c.code_client
        FROM public.clients c
        CROSS JOIN base b
        WHERE c.code_client = b.resultat #>> '{dossier,code_client}'
    ),
    dossier_cible AS MATERIALIZED (
        SELECT d.code_dossier
        FROM client_cible cc
        JOIN public.dossier_clients dc ON dc.client_id = cc.client_id
        JOIN public.dossiers_hypothecaires d ON d.dossier_id = dc.dossier_id
        ORDER BY dc.est_principal DESC, d.updated_at DESC
        LIMIT 1
    ),
    relation AS MATERIALIZED (
        SELECT crm.obtenir_relation_dossier(d.code_dossier) AS objet
        FROM dossier_cible d
    ),
    parcours AS MATERIALIZED (
        SELECT crm.obtenir_parcours_dossier(cc.code_client) AS objet
        FROM client_cible cc
    )
    SELECT CASE
        WHEN b.resultat #>> '{dossier,code_client}' IS NULL THEN b.resultat
        ELSE jsonb_set(
            jsonb_set(
                jsonb_set(
                    b.resultat,
                    '{dossier,code_dossier}',
                    COALESCE(to_jsonb((SELECT d.code_dossier FROM dossier_cible d)), 'null'::jsonb),
                    true
                ),
                '{dossier,relation_dossier}',
                COALESCE((SELECT r.objet FROM relation r), '{}'::jsonb),
                true
            ),
            '{dossier,parcours_hypothecaire}',
            COALESCE((SELECT p.objet FROM parcours p), '{}'::jsonb),
            true
        )
    END
    FROM base b;
$function$;

ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) TO crm_runtime;

CREATE OR REPLACE FUNCTION crm.enregistrer_parcours_hypothecaire(
    p_code_client text,
    p_parcours jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    v_dossier_id uuid;
    v_representant_id uuid;
BEGIN
    IF p_parcours IS NULL OR jsonb_typeof(p_parcours) <> 'array' THEN
        RAISE EXCEPTION 'parcours_invalide';
    END IF;

    SELECT d.dossier_id, d.representant_id
    INTO v_dossier_id, v_representant_id
    FROM public.clients c
    JOIN public.dossier_clients dc ON dc.client_id = c.client_id
    JOIN public.dossiers_hypothecaires d ON d.dossier_id = dc.dossier_id
    WHERE c.code_client = upper(trim(p_code_client))
    ORDER BY dc.est_principal DESC, d.updated_at DESC
    LIMIT 1;

    IF v_dossier_id IS NULL THEN
        RAISE EXCEPTION 'dossier_introuvable';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_parcours) x(item)
        LEFT JOIN crm.etapes_parcours_hypothecaire e
            ON e.etape_code = x.item ->> 'code'
        WHERE e.etape_code IS NULL
           OR coalesce(x.item ->> 'statut', '') NOT IN (
               'a_faire', 'en_cours', 'bloquee', 'complete', 'non_applicable'
           )
    ) THEN
        RAISE EXCEPTION 'etape_parcours_invalide';
    END IF;

    INSERT INTO public.suivi_parcours_hypothecaire (
        dossier_id, representant_id, etape_code, statut, responsable,
        date_debut, date_echeance, date_completion, notes, conditions, updated_at
    )
    SELECT
        v_dossier_id,
        v_representant_id,
        e.etape_code,
        x.item ->> 'statut',
        COALESCE(NULLIF(trim(x.item ->> 'responsable'), ''), e.responsable_defaut),
        NULLIF(x.item ->> 'date_debut', '')::date,
        NULLIF(x.item ->> 'date_echeance', '')::date,
        CASE WHEN x.item ->> 'statut' = 'complete'
            THEN COALESCE(NULLIF(x.item ->> 'date_completion', '')::date, current_date)
            ELSE NULL END,
        NULLIF(trim(x.item ->> 'notes'), ''),
        CASE WHEN jsonb_typeof(x.item -> 'conditions') = 'array'
            THEN x.item -> 'conditions' ELSE '[]'::jsonb END,
        now()
    FROM jsonb_array_elements(p_parcours) x(item)
    JOIN crm.etapes_parcours_hypothecaire e ON e.etape_code = x.item ->> 'code'
    ON CONFLICT (dossier_id, etape_code) DO UPDATE SET
        statut = EXCLUDED.statut,
        responsable = EXCLUDED.responsable,
        date_debut = EXCLUDED.date_debut,
        date_echeance = EXCLUDED.date_echeance,
        date_completion = EXCLUDED.date_completion,
        notes = EXCLUDED.notes,
        conditions = EXCLUDED.conditions,
        updated_at = now();
END;
$function$;

ALTER FUNCTION crm.enregistrer_parcours_hypothecaire(text, jsonb) OWNER TO crm_service_owner;
ALTER FUNCTION crm.enregistrer_parcours_hypothecaire(text, jsonb)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.enregistrer_parcours_hypothecaire(text, jsonb) FROM PUBLIC;

-- Conserve la fonction d'ecriture existante comme implementation de base et ajoute
-- le parcours au meme enregistrement idempotent.
DO $rename$
BEGIN
    IF to_regprocedure('crm.enregistrer_dossier_hypothecaire_sans_parcours(text,jsonb,uuid)') IS NULL THEN
        ALTER FUNCTION crm.enregistrer_dossier_hypothecaire(text, jsonb, uuid)
            RENAME TO enregistrer_dossier_hypothecaire_sans_parcours;
    END IF;
END
$rename$;

REVOKE EXECUTE ON FUNCTION crm.enregistrer_dossier_hypothecaire_sans_parcours(text, jsonb, uuid)
    FROM PUBLIC, crm_runtime;

CREATE OR REPLACE FUNCTION crm.enregistrer_dossier_hypothecaire(
    p_code_client text,
    p_payload jsonb,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM crm.enregistrer_dossier_hypothecaire_sans_parcours(
        p_code_client, p_payload, p_request_id
    );
    IF p_payload ? 'parcours_hypothecaire' THEN
        PERFORM crm.enregistrer_parcours_hypothecaire(
            p_code_client, p_payload -> 'parcours_hypothecaire'
        );
    END IF;
    RETURN crm.obtenir_dossier_hypothecaire(p_code_client);
END;
$function$;

ALTER FUNCTION crm.enregistrer_dossier_hypothecaire(text, jsonb, uuid)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.enregistrer_dossier_hypothecaire(text, jsonb, uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.enregistrer_dossier_hypothecaire(text, jsonb, uuid)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.enregistrer_dossier_hypothecaire(text, jsonb, uuid)
    TO crm_runtime;

COMMENT ON TABLE public.suivi_parcours_hypothecaire IS
    'Etat des 11 etapes du parcours hypothecaire, isole par representant avec RLS.';
COMMENT ON FUNCTION crm.obtenir_parcours_dossier(text) IS
    'Retourne le parcours metier d un dossier sans exposer ses identifiants internes.';
