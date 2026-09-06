BEGIN;

CREATE TEMPORARY TABLE enregistrement_test_context (
    representant_id uuid NOT NULL,
    client_code text NOT NULL
) ON COMMIT DROP;

WITH representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999991', 'Representant Ecriture Test')
    RETURNING representant_id
), client AS (
    INSERT INTO public.clients (representant_id, nom_client, courriel, statut_dossier)
    SELECT representant_id, 'Client Ecriture Test', 'ecriture@example.test', 'Nouveau'
    FROM representant
    RETURNING representant_id, code_client
)
INSERT INTO enregistrement_test_context
SELECT representant_id, code_client FROM client;

GRANT SELECT ON enregistrement_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v_representant_id uuid;
    v_code text;
    v_request_id uuid := '88888888-8888-4888-8888-888888888888';
    v_payload jsonb := '{
      "profil_client": {
        "prenom": "Claire",
        "nom": "Test",
        "date_naissance": "1990-02-15",
        "telephone": "418-555-0190",
        "courriel": "claire@example.test",
        "adresse": {"ville":"Quebec","code_postal":"G1A 1A1"}
      },
      "projet_hypothecaire": {
        "type_transaction":"Achat",
        "type_propriete":"Jumelee",
        "prix_achat":500000,
        "mise_de_fonds":50000
      },
      "participants":[{
        "role":"Codemandeur","prenom":"Alex","nom":"Test",
        "meme_adresse_client":true
      }]
    }'::jsonb;
    v_resultat jsonb;
BEGIN
    SELECT representant_id, client_code INTO v_representant_id, v_code
    FROM enregistrement_test_context;
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);

    v_resultat := crm.enregistrer_dossier_hypothecaire(v_code, v_payload, v_request_id);
    IF v_resultat #>> '{dossier,nom_client}' IS DISTINCT FROM 'Claire Test'
       OR v_resultat #>> '{dossier,profil_client,adresse,ville}' IS DISTINCT FROM 'Quebec'
       OR v_resultat #>> '{dossier,projet_hypothecaire,prix_achat}' IS DISTINCT FROM '500000'
       OR v_resultat #>> '{dossier,participants,0,prenom}' IS DISTINCT FROM 'Alex' THEN
        RAISE EXCEPTION 'Ecriture invalide: %', v_resultat;
    END IF;

    v_resultat := crm.enregistrer_dossier_hypothecaire(v_code, v_payload, v_request_id);
    IF jsonb_array_length(v_resultat #> '{dossier,participants}') IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'La requete idempotente a duplique les participants.';
    END IF;

    BEGIN
        PERFORM crm.enregistrer_dossier_hypothecaire(
            'CLI-2026-BT-000060', v_payload,
            '99999999-9999-4999-8999-999999999999'
        );
        RAISE EXCEPTION 'Un dossier hors portefeuille a ete modifie.';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Un dossier hors portefeuille a ete modifie.' THEN RAISE; END IF;
    END;
END
$test$;

RESET ROLE;
ROLLBACK;
