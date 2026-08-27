BEGIN;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v_riadh_id uuid := 'b8689181-81ce-4bd9-b6af-b8ad6042c608';
    v_mvp_id uuid := 'ac7b7a4b-907e-4733-a0de-4e5ed40e6af0';
    v_resultat jsonb;
BEGIN
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_riadh_id::text, true);

    v_resultat := crm.consulter_portefeuille('{}', '[]', 100, NULL, NULL);
    IF (v_resultat ->> 'nombre_clients')::integer IS DISTINCT FROM 20 THEN
        RAISE EXCEPTION 'Riadh doit voir exactement 20 clients de test: %', v_resultat;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_resultat -> 'rows') r
        WHERE r ->> 'statut_dossier' = 'Documents requis'
          AND (r ->> 'nombre_documents_manquants')::integer > 0
    ) THEN
        RAISE EXCEPTION 'Aucun scenario de documents manquants.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_resultat -> 'rows') r
        WHERE (r ->> 'nombre_taches_en_retard')::integer > 0
    ) THEN
        RAISE EXCEPTION 'Aucun scenario de tache en retard.';
    END IF;

    PERFORM set_config('app.representant_id', v_mvp_id::text, true);
    v_resultat := crm.rechercher_clients_agent('riadh.scenario');
    IF (v_resultat ->> 'nombre_resultats')::integer IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'Les scenarios Riadh sont visibles par MVP: %', v_resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
