-- Vérifie le contrat minimisé de crm.rechercher_clients().

BEGIN;

SET ROLE crm_runtime;

DO $test$
DECLARE
    v_resultat jsonb;
    v_client jsonb;
BEGIN
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config(
        'app.representant_id',
        'ac7b7a4b-907e-4733-a0de-4e5ed40e6af0',
        true
    );

    v_resultat := crm.rechercher_clients('Olivier Bergeron');

    IF (v_resultat ->> 'nombre_resultats')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Un résultat Olivier Bergeron était attendu: %', v_resultat;
    END IF;

    v_client := v_resultat #> '{resultats,0}';

    IF NOT (v_client ? 'client_id') THEN
        RAISE EXCEPTION 'client_id doit rester disponible pour l’orchestration: %', v_resultat;
    END IF;

    IF v_client ?| ARRAY['telephone', 'courriel', 'representant'] THEN
        RAISE EXCEPTION 'Le contrat de recherche expose des champs inutiles: %', v_resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
