BEGIN;

CREATE TEMPORARY TABLE agenda_test_context (
    representant_id uuid NOT NULL,
    code_client text NOT NULL
) ON COMMIT DROP;

WITH representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999992', 'Représentant Agenda Test')
    RETURNING representant_id
), client AS (
    INSERT INTO public.clients (representant_id, nom_client, courriel, statut_dossier)
    SELECT representant_id, 'Client Agenda Test', 'agenda-client@example.test', 'Nouveau'
    FROM representant
    RETURNING representant_id, code_client
)
INSERT INTO agenda_test_context
SELECT representant_id, code_client FROM client;

GRANT SELECT ON agenda_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v_representant_id uuid;
    v_code_client text;
    v_resultat jsonb;
    v_agenda jsonb;
BEGIN
    SELECT representant_id, code_client
    INTO v_representant_id, v_code_client
    FROM agenda_test_context;

    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);

    v_resultat := crm.creer_evenement_agenda(
        jsonb_build_object(
            'titre', 'Rencontre de validation',
            'type', 'rencontre',
            'client_reference', v_code_client,
            'etape_code', 'prise_mandat',
            'debut', '2026-08-27T12:00:00-04:00',
            'fin', '2026-08-27T13:00:00-04:00',
            'rappels', jsonb_build_array(jsonb_build_object('minutes_avant', 30))
        ),
        '99999999-9999-4999-8999-999999999992'::uuid
    );

    IF COALESCE(v_resultat ->> 'code_evenement', '') !~ '^EVT-[A-Z0-9]{12}$' THEN
        RAISE EXCEPTION 'Création Agenda invalide: %', v_resultat;
    END IF;

    v_agenda := crm.consulter_agenda(
        '2026-08-27T00:00:00-04:00',
        '2026-08-28T00:00:00-04:00',
        '{}'::jsonb
    );
    IF (v_agenda ->> 'nombre_evenements')::integer IS DISTINCT FROM 1
       OR jsonb_array_length(v_agenda #> '{evenements,0,rappels}') IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Consultation Agenda invalide: %', v_agenda;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
