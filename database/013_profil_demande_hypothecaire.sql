-- Profil personnel, projet initial, participants et consentements d'un dossier.
-- Cette migration enrichit le modele existant sans modifier les contrats historiques.

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS prenom text,
    ADD COLUMN IF NOT EXISTS nom text,
    ADD COLUMN IF NOT EXISTS date_naissance date,
    ADD COLUMN IF NOT EXISTS telephone_type text,
    ADD COLUMN IF NOT EXISTS canal_contact_prefere text,
    ADD COLUMN IF NOT EXISTS moment_contact_prefere text,
    ADD COLUMN IF NOT EXISTS adresse_numero_civique text,
    ADD COLUMN IF NOT EXISTS adresse_rue text,
    ADD COLUMN IF NOT EXISTS adresse_type_rue text,
    ADD COLUMN IF NOT EXISTS adresse_direction text,
    ADD COLUMN IF NOT EXISTS adresse_unite text,
    ADD COLUMN IF NOT EXISTS adresse_ville text,
    ADD COLUMN IF NOT EXISTS adresse_province text,
    ADD COLUMN IF NOT EXISTS adresse_code_postal text,
    ADD COLUMN IF NOT EXISTS adresse_pays text DEFAULT 'Canada',
    ADD COLUMN IF NOT EXISTS adresse_validee boolean NOT NULL DEFAULT false;

ALTER TABLE public.details_hypothecaires
    ADD COLUMN IF NOT EXISTS echeancier_projet text,
    ADD COLUMN IF NOT EXISTS type_propriete text,
    ADD COLUMN IF NOT EXISTS type_occupation text,
    ADD COLUMN IF NOT EXISTS prix_achat numeric,
    ADD COLUMN IF NOT EXISTS mise_de_fonds numeric,
    ADD COLUMN IF NOT EXISTS montant_requis numeric,
    ADD COLUMN IF NOT EXISTS date_renouvellement date,
    ADD COLUMN IF NOT EXISTS commentaires text,
    ADD COLUMN IF NOT EXISTS source_demande text,
    ADD COLUMN IF NOT EXISTS date_soumission timestamptz,
    ADD COLUMN IF NOT EXISTS statut_soumission text;

CREATE TABLE IF NOT EXISTS public.participants_dossier (
    participant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    role_participant text NOT NULL DEFAULT 'Codemandeur',
    prenom text NOT NULL,
    nom text NOT NULL,
    date_naissance date,
    telephone text,
    telephone_type text,
    courriel text,
    meme_adresse_client boolean NOT NULL DEFAULT false,
    adresse_numero_civique text,
    adresse_rue text,
    adresse_type_rue text,
    adresse_direction text,
    adresse_unite text,
    adresse_ville text,
    adresse_province text,
    adresse_code_postal text,
    adresse_pays text DEFAULT 'Canada',
    canal_contact_prefere text,
    moment_contact_prefere text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_participants_role CHECK (
        lower(role_participant) IN ('codemandeur', 'garant', 'autre')
    )
);

CREATE INDEX IF NOT EXISTS ix_participants_dossier_client
    ON public.participants_dossier(client_id);
CREATE INDEX IF NOT EXISTS ix_participants_dossier_representant
    ON public.participants_dossier(representant_id);

CREATE TABLE IF NOT EXISTS public.consentements_dossier (
    consentement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    participant_id uuid REFERENCES public.participants_dossier(participant_id) ON DELETE CASCADE,
    type_consentement text NOT NULL,
    version_texte text NOT NULL,
    accepte boolean NOT NULL,
    accepte_at timestamptz,
    retire_at timestamptz,
    canal text NOT NULL DEFAULT 'Formulaire Web',
    reference_preuve text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_consentement_date CHECK (
        (accepte = false) OR (accepte_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_consentements_dossier_client
    ON public.consentements_dossier(client_id);
CREATE INDEX IF NOT EXISTS ix_consentements_dossier_representant
    ON public.consentements_dossier(representant_id);

ALTER TABLE public.participants_dossier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants_dossier FORCE ROW LEVEL SECURITY;
ALTER TABLE public.consentements_dossier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consentements_dossier FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participants_dossier_access_policy ON public.participants_dossier;
CREATE POLICY participants_dossier_access_policy ON public.participants_dossier
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

DROP POLICY IF EXISTS consentements_dossier_access_policy ON public.consentements_dossier;
CREATE POLICY consentements_dossier_access_policy ON public.consentements_dossier
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

GRANT SELECT ON public.participants_dossier, public.consentements_dossier
    TO crm_service_owner;

CREATE OR REPLACE FUNCTION crm.obtenir_dossier_hypothecaire(p_reference_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH base AS MATERIALIZED (
        SELECT crm.obtenir_dossier_client(p_reference_client) AS resultat
    ),
    cible AS MATERIALIZED (
        SELECT c.*
        FROM public.clients c
        CROSS JOIN base b
        WHERE c.code_client = b.resultat #>> '{dossier,code_client}'
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
        ) AS objet,
        jsonb_build_object(
            'type_transaction', c.type_transaction,
            'echeancier_projet', h.echeancier_projet,
            'type_propriete', h.type_propriete,
            'type_occupation', h.type_occupation,
            'prix_achat', COALESCE(h.prix_achat, c.prix_achat),
            'mise_de_fonds', h.mise_de_fonds,
            'mise_de_fonds_texte', c.mise_de_fonds,
            'valeur_propriete', c.valeur_propriete,
            'solde_hypothecaire', c.solde_hypothecaire,
            'montant_requis', COALESCE(h.montant_requis, c.montant_financement),
            'date_renouvellement', h.date_renouvellement,
            'commentaires', h.commentaires,
            'source_demande', h.source_demande,
            'date_soumission', h.date_soumission,
            'statut_soumission', h.statut_soumission
        ) AS projet
        FROM cible c
        LEFT JOIN public.details_hypothecaires h ON h.client_id = c.client_id
    ),
    profil AS (
        SELECT jsonb_build_object(
            'prenom', c.prenom,
            'nom', c.nom,
            'date_naissance', c.date_naissance,
            'telephone_type', c.telephone_type,
            'canal_contact_prefere', c.canal_contact_prefere,
            'moment_contact_prefere', c.moment_contact_prefere,
            'adresse', jsonb_build_object(
                'numero_civique', c.adresse_numero_civique,
                'rue', c.adresse_rue,
                'type_rue', c.adresse_type_rue,
                'direction', c.adresse_direction,
                'unite', c.adresse_unite,
                'ville', c.adresse_ville,
                'province', c.adresse_province,
                'code_postal', c.adresse_code_postal,
                'pays', c.adresse_pays,
                'validee', c.adresse_validee
            )
        ) AS objet
        FROM cible c
    ),
    participants AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'role', p.role_participant,
            'prenom', p.prenom,
            'nom', p.nom,
            'date_naissance', p.date_naissance,
            'telephone', p.telephone,
            'telephone_type', p.telephone_type,
            'courriel', p.courriel,
            'meme_adresse_client', p.meme_adresse_client,
            'adresse', CASE WHEN p.meme_adresse_client THEN NULL ELSE jsonb_build_object(
                'numero_civique', p.adresse_numero_civique,
                'rue', p.adresse_rue,
                'type_rue', p.adresse_type_rue,
                'direction', p.adresse_direction,
                'unite', p.adresse_unite,
                'ville', p.adresse_ville,
                'province', p.adresse_province,
                'code_postal', p.adresse_code_postal,
                'pays', p.adresse_pays
            ) END,
            'canal_contact_prefere', p.canal_contact_prefere,
            'moment_contact_prefere', p.moment_contact_prefere
        ) ORDER BY p.created_at), '[]'::jsonb) AS elements
        FROM cible c
        LEFT JOIN public.participants_dossier p ON p.client_id = c.client_id
        WHERE p.participant_id IS NOT NULL
    ),
    consentements AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'type', x.type_consentement,
            'version_texte', x.version_texte,
            'accepte', x.accepte,
            'accepte_at', x.accepte_at,
            'retire_at', x.retire_at,
            'canal', x.canal,
            'reference_preuve', x.reference_preuve
        ) ORDER BY x.created_at), '[]'::jsonb) AS elements
        FROM cible c
        LEFT JOIN public.consentements_dossier x ON x.client_id = c.client_id
        WHERE x.consentement_id IS NOT NULL
    ),
    enrichi AS (
        SELECT jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        b.resultat,
                        '{dossier,details_hypothecaires}',
                        COALESCE(d.objet, '{}'::jsonb), true
                    ),
                    '{dossier,profil_client}', COALESCE(p.objet, '{}'::jsonb), true
                ),
                '{dossier,projet_hypothecaire}', COALESCE(d.projet, '{}'::jsonb), true
            ),
            '{dossier,participants}', COALESCE(pa.elements, '[]'::jsonb), true
        ) AS resultat,
        COALESCE(co.elements, '[]'::jsonb) AS consentements
        FROM base b
        LEFT JOIN details d ON true
        LEFT JOIN profil p ON true
        LEFT JOIN participants pa ON true
        LEFT JOIN consentements co ON true
    )
    SELECT CASE
        WHEN e.resultat #>> '{dossier,code_client}' IS NULL THEN e.resultat
        ELSE jsonb_set(e.resultat, '{dossier,consentements}', e.consentements, true)
    END
    FROM enrichi e;
$function$;

ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_dossier_hypothecaire(text) IS
    'Retourne profil, projet, participants, consentements et details du dossier sans UUID.';
