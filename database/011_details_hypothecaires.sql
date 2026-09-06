-- Détails spécialisés d'un financement hypothécaire, séparés de la fiche client.
-- Le service JSON réutilise la résolution de client existante et n'expose aucun UUID.

CREATE TABLE IF NOT EXISTS public.details_hypothecaires (
    detail_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL UNIQUE REFERENCES public.clients(client_id) ON DELETE CASCADE,
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    preteur text,
    produit text,
    statut_approbation text,
    date_approbation date,
    conditions_approbation text,
    taux_interet numeric(7,4),
    type_taux text,
    terme_mois integer,
    amortissement_annees integer,
    date_fermeture date,
    date_decaissement date,
    notaire_nom text,
    notaire_telephone text,
    instructions_notaire_statut text,
    instructions_notaire_date date,
    evaluation_requise boolean,
    evaluation_statut text,
    evaluateur_nom text,
    evaluation_date date,
    valeur_evaluee numeric,
    assurance_requise boolean,
    assureur_pret text,
    assurance_statut text,
    prime_assurance numeric,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_details_terme CHECK (terme_mois IS NULL OR terme_mois > 0),
    CONSTRAINT ck_details_amortissement CHECK (
        amortissement_annees IS NULL OR amortissement_annees > 0
    ),
    CONSTRAINT ck_details_taux CHECK (taux_interet IS NULL OR taux_interet >= 0)
);

CREATE INDEX IF NOT EXISTS ix_details_hypothecaires_representant
    ON public.details_hypothecaires(representant_id);

ALTER TABLE public.details_hypothecaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.details_hypothecaires FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS details_hypothecaires_access_policy
    ON public.details_hypothecaires;
CREATE POLICY details_hypothecaires_access_policy
ON public.details_hypothecaires
USING (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
    OR (
        current_setting('app.role', true) = 'client'
        AND client_id::text = current_setting('app.client_id', true)
    )
)
WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
);

GRANT SELECT ON TABLE public.details_hypothecaires TO crm_service_owner;

CREATE OR REPLACE FUNCTION crm.obtenir_dossier_hypothecaire(
    p_reference_client text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH base AS MATERIALIZED (
        SELECT crm.obtenir_dossier_client(p_reference_client) AS resultat
    ),
    details AS (
        SELECT jsonb_build_object(
            'preteur', h.preteur,
            'produit', h.produit,
            'statut_approbation', h.statut_approbation,
            'date_approbation', h.date_approbation,
            'conditions_approbation', h.conditions_approbation,
            'taux_interet', h.taux_interet,
            'type_taux', h.type_taux,
            'terme_mois', h.terme_mois,
            'amortissement_annees', h.amortissement_annees,
            'date_fermeture', h.date_fermeture,
            'date_decaissement', h.date_decaissement,
            'notaire_nom', h.notaire_nom,
            'notaire_telephone', h.notaire_telephone,
            'instructions_notaire_statut', h.instructions_notaire_statut,
            'instructions_notaire_date', h.instructions_notaire_date,
            'evaluation_requise', h.evaluation_requise,
            'evaluation_statut', h.evaluation_statut,
            'evaluateur_nom', h.evaluateur_nom,
            'evaluation_date', h.evaluation_date,
            'valeur_evaluee', h.valeur_evaluee,
            'assurance_requise', h.assurance_requise,
            'assureur_pret', h.assureur_pret,
            'assurance_statut', h.assurance_statut,
            'prime_assurance', h.prime_assurance
        ) AS objet
        FROM public.details_hypothecaires h
        JOIN public.clients c ON c.client_id = h.client_id
        CROSS JOIN base b
        WHERE c.code_client = b.resultat #>> '{dossier,code_client}'
    )
    SELECT CASE
        WHEN b.resultat #>> '{dossier,code_client}' IS NULL THEN b.resultat
        ELSE jsonb_set(
            b.resultat,
            '{dossier,details_hypothecaires}',
            COALESCE((SELECT d.objet FROM details d), '{}'::jsonb),
            true
        )
    END
    FROM base b;
$function$;

ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;

REVOKE EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_dossier_hypothecaire(text) IS
    'Retourne le dossier client et ses détails hypothécaires spécialisés, sans UUID.';
