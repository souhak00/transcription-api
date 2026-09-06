BEGIN;

CREATE TEMPORARY TABLE parcours_test_context (
    representant_id uuid NOT NULL,
    autre_representant_id uuid NOT NULL,
    code_client text NOT NULL
) ON COMMIT DROP;

WITH representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999988', 'Representant Parcours Test')
    RETURNING representant_id
), autre_representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999987', 'Autre Representant Parcours Test')
    RETURNING representant_id
), client AS (
    INSERT INTO public.clients (
        representant_id, nom_client, courriel, type_transaction
    )
    SELECT representant_id, 'Client Parcours Test',
           'parcours@example.test', 'Achat'
    FROM representant
    RETURNING representant_id, code_client
)
INSERT INTO parcours_test_context (representant_id, autre_representant_id, code_client)
SELECT c.representant_id, a.representant_id, c.code_client
FROM client c CROSS JOIN autre_representant a;

GRANT SELECT ON parcours_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v parcours_test_context%ROWTYPE;
    resultat jsonb;
BEGIN
    SELECT * INTO v FROM parcours_test_context;
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v.representant_id::text, true);

    resultat := crm.obtenir_parcours_dossier(v.code_client);
    IF jsonb_array_length(resultat -> 'etapes') IS DISTINCT FROM 11
       OR resultat #>> '{etape_courante,code}' IS DISTINCT FROM 'prise_mandat' THEN
        RAISE EXCEPTION 'Initialisation du parcours invalide: %', resultat;
    END IF;

    resultat := crm.enregistrer_dossier_hypothecaire(
        v.code_client,
        jsonb_build_object(
            'parcours_hypothecaire', jsonb_build_array(jsonb_build_object(
                'code', 'prise_mandat',
                'statut', 'complete',
                'responsable', 'courtier_hypothecaire',
                'date_completion', current_date,
                'notes', 'Mandat et divulgations verifies',
                'conditions', jsonb_build_array('Divulgation remise')
            ))
        ),
        gen_random_uuid()
    );

    IF resultat #>> '{dossier,parcours_hypothecaire,etape_courante,code}'
            IS DISTINCT FROM 'analyse_projet'
       OR resultat #>> '{dossier,parcours_hypothecaire,etapes,0,statut}'
            IS DISTINCT FROM 'complete' THEN
        RAISE EXCEPTION 'Mise a jour du parcours invalide: %', resultat;
    END IF;

    PERFORM set_config('app.representant_id', v.autre_representant_id::text, true);
    resultat := crm.obtenir_parcours_dossier(v.code_client);
    IF resultat IS NOT NULL THEN
        RAISE EXCEPTION 'Un autre representant voit le parcours: %', resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
