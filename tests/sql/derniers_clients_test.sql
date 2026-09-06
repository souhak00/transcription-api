-- Test transactionnel du service crm.obtenir_derniers_clients().
-- Prérequis : migrations 001 à 006 appliquées par un administrateur.

BEGIN;

CREATE TEMPORARY TABLE derniers_clients_test_context (
    representant_test_id uuid NOT NULL
) ON COMMIT DROP;

WITH representant_test AS (
    INSERT INTO public.representants (
        code_representant,
        nom_representant,
        courriel
    )
    VALUES (
        '2026999997',
        'Représentant Derniers Clients',
        'derniers-clients@example.test'
    )
    RETURNING representant_id
)
INSERT INTO derniers_clients_test_context (representant_test_id)
SELECT representant_id
FROM representant_test;

INSERT INTO public.clients (
    representant_id,
    nom_client,
    courriel,
    statut_dossier,
    created_at,
    updated_at
)
SELECT
    contexte.representant_test_id,
    'Client Récent ' || serie.numero,
    'client-recent-' || serie.numero || '@example.test',
    'Nouveau',
    timestamptz '2026-08-09 12:00:00-04' + serie.numero * interval '1 minute',
    timestamptz '2026-08-09 12:00:00-04' + serie.numero * interval '1 minute'
FROM derniers_clients_test_context contexte
CROSS JOIN generate_series(1, 12) AS serie(numero);

WITH representant_isole AS (
    INSERT INTO public.representants (
        code_representant,
        nom_representant,
        courriel
    )
    VALUES (
        '2026999996',
        'Représentant Hors Portefeuille',
        'hors-portefeuille@example.test'
    )
    RETURNING representant_id
)
INSERT INTO public.clients (
    representant_id,
    nom_client,
    courriel,
    statut_dossier,
    created_at,
    updated_at
)
SELECT
    representant_id,
    'Client Hors Portefeuille',
    'client-hors-portefeuille@example.test',
    'Nouveau',
    timestamptz '2026-08-09 13:00:00-04',
    timestamptz '2026-08-09 13:00:00-04'
FROM representant_isole;

GRANT SELECT ON derniers_clients_test_context TO crm_runtime;

SET ROLE crm_runtime;

DO $test$
DECLARE
    v_representant_id uuid;
    v_resultat jsonb;
BEGIN
    SELECT representant_test_id
    INTO v_representant_id
    FROM derniers_clients_test_context;

    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);

    v_resultat := crm.obtenir_derniers_clients();

    IF (v_resultat ->> 'limite')::integer IS DISTINCT FROM 10 THEN
        RAISE EXCEPTION 'Limite inattendue: %', v_resultat;
    END IF;

    IF (v_resultat ->> 'nombre_resultats')::integer IS DISTINCT FROM 10 THEN
        RAISE EXCEPTION 'Nombre de résultats inattendu: %', v_resultat;
    END IF;

    IF jsonb_array_length(v_resultat -> 'clients') IS DISTINCT FROM 10 THEN
        RAISE EXCEPTION 'Le tableau ne contient pas dix clients: %', v_resultat;
    END IF;

    IF v_resultat #>> '{clients,0,nom_client}' IS DISTINCT FROM 'Client Récent 12' THEN
        RAISE EXCEPTION 'Premier client inattendu: %', v_resultat;
    END IF;

    IF v_resultat #>> '{clients,9,nom_client}' IS DISTINCT FROM 'Client Récent 3' THEN
        RAISE EXCEPTION 'Dernier client inattendu: %', v_resultat;
    END IF;

    IF (v_resultat #> '{clients,0}') ? 'client_id' THEN
        RAISE EXCEPTION 'Le service ne doit pas exposer client_id: %', v_resultat;
    END IF;

    IF v_resultat::text LIKE '%Client Hors Portefeuille%' THEN
        RAISE EXCEPTION 'La RLS a révélé un client d’un autre représentant: %', v_resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
