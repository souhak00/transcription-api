BEGIN;

CREATE TEMPORARY TABLE profil_demande_test_context (
    representant_id uuid NOT NULL,
    client_id uuid NOT NULL
) ON COMMIT DROP;

WITH representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999992', 'Representant Profil Demande')
    RETURNING representant_id
), client AS (
    INSERT INTO public.clients (
        representant_id, nom_client, prenom, nom, telephone, telephone_type,
        courriel, date_naissance, canal_contact_prefere, moment_contact_prefere,
        adresse_numero_civique, adresse_rue, adresse_ville,
        adresse_province, adresse_code_postal, statut_dossier
    )
    SELECT representant_id, 'Bernard Exemple', 'Bernard', 'Exemple',
        '418-555-0100', 'Cellulaire', 'bernard@example.test', date '1980-11-13',
        'Telephone', 'Soiree', '2428', 'chemin Sainte-Foy', 'Quebec',
        'Quebec', 'G1X 1W3', 'Nouveau'
    FROM representant
    RETURNING client_id, representant_id
)
INSERT INTO profil_demande_test_context
SELECT representant_id, client_id FROM client;

INSERT INTO public.details_hypothecaires (
    client_id, representant_id, echeancier_projet, type_propriete,
    type_occupation, prix_achat, mise_de_fonds, montant_requis,
    source_demande, statut_soumission
)
SELECT client_id, representant_id, 'Dans les 6 prochains mois', 'Jumelee',
    'Occupee par proprietaire', 500000, 50000, 450000,
    'Formulaire Web', 'Brouillon'
FROM profil_demande_test_context;

INSERT INTO public.participants_dossier (
    client_id, representant_id, role_participant, prenom, nom,
    date_naissance, meme_adresse_client, canal_contact_prefere
)
SELECT client_id, representant_id, 'Codemandeur', 'Bernadette', 'Exemple',
    date '1980-08-22', true, 'Courriel'
FROM profil_demande_test_context;

INSERT INTO public.consentements_dossier (
    client_id, representant_id, type_consentement, version_texte,
    accepte, accepte_at, canal
)
SELECT client_id, representant_id, 'Recherche de credit', '2026-08',
    true, now(), 'Formulaire Web'
FROM profil_demande_test_context;

GRANT SELECT ON profil_demande_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v_representant_id uuid;
    v_resultat jsonb;
BEGIN
    SELECT representant_id INTO v_representant_id FROM profil_demande_test_context;
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);
    v_resultat := crm.obtenir_dossier_hypothecaire('Bernard Exemple');

    IF v_resultat #>> '{dossier,profil_client,date_naissance}' IS DISTINCT FROM '1980-11-13'
       OR v_resultat #>> '{dossier,projet_hypothecaire,type_propriete}' IS DISTINCT FROM 'Jumelee'
       OR v_resultat #>> '{dossier,participants,0,prenom}' IS DISTINCT FROM 'Bernadette'
       OR v_resultat #>> '{dossier,consentements,0,type}' IS DISTINCT FROM 'Recherche de credit' THEN
        RAISE EXCEPTION 'Dossier enrichi invalide: %', v_resultat;
    END IF;
    IF v_resultat::text ~ 'participant_id|consentement_id|representant_id|client_id' THEN
        RAISE EXCEPTION 'Un identifiant technique est expose: %', v_resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
