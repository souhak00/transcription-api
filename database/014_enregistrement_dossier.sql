-- Ecriture controlee et idempotente du profil et du projet hypothecaire.

CREATE TABLE IF NOT EXISTS public.journal_modifications_dossier (
    journal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL UNIQUE,
    client_id uuid NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    action text NOT NULL,
    champs_modifies text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_journal_dossier_representant
    ON public.journal_modifications_dossier(representant_id, created_at DESC);

ALTER TABLE public.journal_modifications_dossier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_modifications_dossier FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_modifications_dossier_access_policy
    ON public.journal_modifications_dossier;
CREATE POLICY journal_modifications_dossier_access_policy
ON public.journal_modifications_dossier
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

GRANT SELECT, UPDATE ON public.clients TO crm_service_owner;
GRANT SELECT, INSERT, UPDATE ON public.details_hypothecaires TO crm_service_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants_dossier
    TO crm_service_owner;
GRANT SELECT, INSERT ON public.journal_modifications_dossier
    TO crm_service_owner;

CREATE OR REPLACE FUNCTION crm.enregistrer_dossier_hypothecaire(
    p_code_client text,
    p_payload jsonb,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_client_id uuid;
    v_representant_id uuid;
    v_profile jsonb := COALESCE(p_payload -> 'profil_client', '{}'::jsonb);
    v_project jsonb := COALESCE(p_payload -> 'projet_hypothecaire', '{}'::jsonb);
    v_result jsonb;
BEGIN
    IF p_request_id IS NULL THEN
        RAISE EXCEPTION 'request_id_requis';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'payload_invalide';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.journal_modifications_dossier j
        WHERE j.request_id = p_request_id
    ) THEN
        RETURN crm.obtenir_dossier_hypothecaire(p_code_client);
    END IF;

    SELECT c.client_id, c.representant_id
    INTO v_client_id, v_representant_id
    FROM public.clients c
    WHERE c.code_client = upper(trim(p_code_client));

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'client_introuvable';
    END IF;

    UPDATE public.clients c SET
        prenom = CASE WHEN v_profile ? 'prenom' THEN NULLIF(trim(v_profile ->> 'prenom'), '') ELSE c.prenom END,
        nom = CASE WHEN v_profile ? 'nom' THEN NULLIF(trim(v_profile ->> 'nom'), '') ELSE c.nom END,
        nom_client = CASE
            WHEN v_profile ? 'prenom' OR v_profile ? 'nom' THEN
                NULLIF(trim(concat_ws(' ', v_profile ->> 'prenom', v_profile ->> 'nom')), '')
            ELSE c.nom_client
        END,
        date_naissance = CASE WHEN v_profile ? 'date_naissance'
            THEN NULLIF(v_profile ->> 'date_naissance', '')::date ELSE c.date_naissance END,
        telephone = CASE WHEN v_profile ? 'telephone' THEN NULLIF(trim(v_profile ->> 'telephone'), '') ELSE c.telephone END,
        telephone_type = CASE WHEN v_profile ? 'telephone_type' THEN NULLIF(trim(v_profile ->> 'telephone_type'), '') ELSE c.telephone_type END,
        courriel = CASE WHEN v_profile ? 'courriel' THEN NULLIF(lower(trim(v_profile ->> 'courriel')), '') ELSE c.courriel END,
        canal_contact_prefere = CASE WHEN v_profile ? 'canal_contact_prefere' THEN NULLIF(trim(v_profile ->> 'canal_contact_prefere'), '') ELSE c.canal_contact_prefere END,
        moment_contact_prefere = CASE WHEN v_profile ? 'moment_contact_prefere' THEN NULLIF(trim(v_profile ->> 'moment_contact_prefere'), '') ELSE c.moment_contact_prefere END,
        adresse_numero_civique = CASE WHEN v_profile #> '{adresse}' ? 'numero_civique' THEN NULLIF(trim(v_profile #>> '{adresse,numero_civique}'), '') ELSE c.adresse_numero_civique END,
        adresse_rue = CASE WHEN v_profile #> '{adresse}' ? 'rue' THEN NULLIF(trim(v_profile #>> '{adresse,rue}'), '') ELSE c.adresse_rue END,
        adresse_type_rue = CASE WHEN v_profile #> '{adresse}' ? 'type_rue' THEN NULLIF(trim(v_profile #>> '{adresse,type_rue}'), '') ELSE c.adresse_type_rue END,
        adresse_direction = CASE WHEN v_profile #> '{adresse}' ? 'direction' THEN NULLIF(trim(v_profile #>> '{adresse,direction}'), '') ELSE c.adresse_direction END,
        adresse_unite = CASE WHEN v_profile #> '{adresse}' ? 'unite' THEN NULLIF(trim(v_profile #>> '{adresse,unite}'), '') ELSE c.adresse_unite END,
        adresse_ville = CASE WHEN v_profile #> '{adresse}' ? 'ville' THEN NULLIF(trim(v_profile #>> '{adresse,ville}'), '') ELSE c.adresse_ville END,
        adresse_province = CASE WHEN v_profile #> '{adresse}' ? 'province' THEN NULLIF(trim(v_profile #>> '{adresse,province}'), '') ELSE c.adresse_province END,
        adresse_code_postal = CASE WHEN v_profile #> '{adresse}' ? 'code_postal' THEN upper(NULLIF(trim(v_profile #>> '{adresse,code_postal}'), '')) ELSE c.adresse_code_postal END,
        adresse_pays = CASE WHEN v_profile #> '{adresse}' ? 'pays' THEN NULLIF(trim(v_profile #>> '{adresse,pays}'), '') ELSE c.adresse_pays END,
        adresse_validee = CASE WHEN v_profile #> '{adresse}' ? 'validee' THEN COALESCE((v_profile #>> '{adresse,validee}')::boolean, false) ELSE c.adresse_validee END,
        type_transaction = CASE WHEN v_project ? 'type_transaction' THEN NULLIF(trim(v_project ->> 'type_transaction'), '') ELSE c.type_transaction END,
        prix_achat = CASE WHEN v_project ? 'prix_achat' THEN NULLIF(v_project ->> 'prix_achat', '')::numeric ELSE c.prix_achat END,
        valeur_propriete = CASE WHEN v_project ? 'valeur_propriete' THEN NULLIF(v_project ->> 'valeur_propriete', '')::numeric ELSE c.valeur_propriete END,
        solde_hypothecaire = CASE WHEN v_project ? 'solde_hypothecaire' THEN NULLIF(v_project ->> 'solde_hypothecaire', '')::numeric ELSE c.solde_hypothecaire END,
        montant_financement = CASE WHEN v_project ? 'montant_requis' THEN NULLIF(v_project ->> 'montant_requis', '')::numeric ELSE c.montant_financement END,
        updated_at = now()
    WHERE c.client_id = v_client_id;

    INSERT INTO public.details_hypothecaires (
        client_id, representant_id, echeancier_projet, type_propriete,
        type_occupation, prix_achat, mise_de_fonds, montant_requis,
        date_renouvellement, commentaires, source_demande,
        statut_soumission, updated_at
    ) VALUES (
        v_client_id, v_representant_id,
        NULLIF(trim(v_project ->> 'echeancier_projet'), ''),
        NULLIF(trim(v_project ->> 'type_propriete'), ''),
        NULLIF(trim(v_project ->> 'type_occupation'), ''),
        NULLIF(v_project ->> 'prix_achat', '')::numeric,
        NULLIF(v_project ->> 'mise_de_fonds', '')::numeric,
        NULLIF(v_project ->> 'montant_requis', '')::numeric,
        NULLIF(v_project ->> 'date_renouvellement', '')::date,
        NULLIF(trim(v_project ->> 'commentaires'), ''),
        COALESCE(NULLIF(trim(v_project ->> 'source_demande'), ''), 'Interface CRM'),
        COALESCE(NULLIF(trim(v_project ->> 'statut_soumission'), ''), 'Brouillon'),
        now()
    )
    ON CONFLICT (client_id) DO UPDATE SET
        echeancier_projet = CASE WHEN v_project ? 'echeancier_projet' THEN EXCLUDED.echeancier_projet ELSE details_hypothecaires.echeancier_projet END,
        type_propriete = CASE WHEN v_project ? 'type_propriete' THEN EXCLUDED.type_propriete ELSE details_hypothecaires.type_propriete END,
        type_occupation = CASE WHEN v_project ? 'type_occupation' THEN EXCLUDED.type_occupation ELSE details_hypothecaires.type_occupation END,
        prix_achat = CASE WHEN v_project ? 'prix_achat' THEN EXCLUDED.prix_achat ELSE details_hypothecaires.prix_achat END,
        mise_de_fonds = CASE WHEN v_project ? 'mise_de_fonds' THEN EXCLUDED.mise_de_fonds ELSE details_hypothecaires.mise_de_fonds END,
        montant_requis = CASE WHEN v_project ? 'montant_requis' THEN EXCLUDED.montant_requis ELSE details_hypothecaires.montant_requis END,
        date_renouvellement = CASE WHEN v_project ? 'date_renouvellement' THEN EXCLUDED.date_renouvellement ELSE details_hypothecaires.date_renouvellement END,
        commentaires = CASE WHEN v_project ? 'commentaires' THEN EXCLUDED.commentaires ELSE details_hypothecaires.commentaires END,
        source_demande = CASE WHEN v_project ? 'source_demande' THEN EXCLUDED.source_demande ELSE details_hypothecaires.source_demande END,
        statut_soumission = CASE WHEN v_project ? 'statut_soumission' THEN EXCLUDED.statut_soumission ELSE details_hypothecaires.statut_soumission END,
        updated_at = now();

    IF p_payload ? 'participants' THEN
        DELETE FROM public.participants_dossier p WHERE p.client_id = v_client_id;
        INSERT INTO public.participants_dossier (
            client_id, representant_id, role_participant, prenom, nom,
            date_naissance, telephone, telephone_type, courriel,
            meme_adresse_client, canal_contact_prefere, moment_contact_prefere
        )
        SELECT
            v_client_id, v_representant_id,
            COALESCE(NULLIF(trim(x.item ->> 'role'), ''), 'Codemandeur'),
            trim(x.item ->> 'prenom'), trim(x.item ->> 'nom'),
            NULLIF(x.item ->> 'date_naissance', '')::date,
            NULLIF(trim(x.item ->> 'telephone'), ''),
            NULLIF(trim(x.item ->> 'telephone_type'), ''),
            NULLIF(lower(trim(x.item ->> 'courriel')), ''),
            COALESCE((x.item ->> 'meme_adresse_client')::boolean, false),
            NULLIF(trim(x.item ->> 'canal_contact_prefere'), ''),
            NULLIF(trim(x.item ->> 'moment_contact_prefere'), '')
        FROM jsonb_array_elements(COALESCE(p_payload -> 'participants', '[]'::jsonb)) x(item)
        WHERE trim(COALESCE(x.item ->> 'prenom', '')) <> ''
          AND trim(COALESCE(x.item ->> 'nom', '')) <> '';
    END IF;

    INSERT INTO public.journal_modifications_dossier (
        request_id, client_id, representant_id, action, champs_modifies
    ) VALUES (
        p_request_id, v_client_id, v_representant_id, 'Mise a jour dossier',
        ARRAY(SELECT jsonb_object_keys(p_payload))
    );

    v_result := crm.obtenir_dossier_hypothecaire(p_code_client);
    RETURN v_result;
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

COMMENT ON FUNCTION crm.enregistrer_dossier_hypothecaire(text, jsonb, uuid) IS
    'Met a jour un dossier visible, remplace ses participants et journalise la requete.';
