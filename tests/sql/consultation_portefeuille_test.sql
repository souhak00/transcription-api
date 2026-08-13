BEGIN;

CREATE TEMPORARY TABLE portefeuille_test_context (
    representant_id uuid NOT NULL
) ON COMMIT DROP;

WITH representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999993', 'Représentant Portefeuille Test')
    RETURNING representant_id
), clients_test AS (
    INSERT INTO public.clients (
        representant_id, nom_client, courriel, revenu_annuel,
        statut_dossier, date_rappel, updated_at
    )
    SELECT representant_id, 'Client Prioritaire', 'prioritaire@example.test',
        80000, 'En analyse', current_date - 1, now()
    FROM representant
    UNION ALL
    SELECT representant_id, 'Client Revenu', 'revenu@example.test',
        150000, 'Nouveau', current_date + 10, now() - interval '1 day'
    FROM representant
    RETURNING client_id, representant_id, nom_client
)
INSERT INTO portefeuille_test_context
SELECT DISTINCT representant_id FROM clients_test;

INSERT INTO public.taches (client_id, representant_id, titre, date_echeance, statut)
SELECT c.client_id, c.representant_id, 'Relance en retard', current_date - 2, 'Ouverte'
FROM public.clients c
WHERE c.courriel = 'prioritaire@example.test';

GRANT SELECT ON portefeuille_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v_representant_id uuid;
    v_resultat jsonb;
BEGIN
    SELECT representant_id INTO v_representant_id FROM portefeuille_test_context;
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);

    v_resultat := crm.consulter_portefeuille(
        '{"statut":"En analyse"}',
        '[{"field":"priority_score","direction":"desc"}]',
        20, NULL, NULL
    );
    IF (v_resultat ->> 'nombre_clients')::integer IS DISTINCT FROM 1
       OR v_resultat #>> '{rows,0,nom_client}' IS DISTINCT FROM 'Client Prioritaire' THEN
        RAISE EXCEPTION 'Filtrage portefeuille invalide: %', v_resultat;
    END IF;

    v_resultat := crm.consulter_portefeuille(
        '{}', '[]', 20, NULL,
        '{"operation":"max","field":"revenu_annuel"}'
    );
    IF v_resultat #>> '{rows,0,nom_client}' IS DISTINCT FROM 'Client Revenu' THEN
        RAISE EXCEPTION 'Agrégation portefeuille invalide: %', v_resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
