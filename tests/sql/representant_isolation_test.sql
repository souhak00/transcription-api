-- Test d'intégration de l'isolation RLS.
-- Prérequis : migrations 001 à 005 appliquées par un administrateur.
-- Toutes les données créées ci-dessous sont annulées à la fin du test.

BEGIN;

DO $preconditions$
BEGIN
    IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'crm_runtime') THEN
        RAISE EXCEPTION 'crm_runtime ne doit être ni superutilisateur ni BYPASSRLS';
    END IF;
END
$preconditions$;

CREATE TEMPORARY TABLE isolation_test_context (
    representant_principal_id uuid NOT NULL,
    representant_isole_id uuid NOT NULL,
    client_isole_id uuid NOT NULL,
    client_isole_code text NOT NULL
) ON COMMIT DROP;

WITH principal AS (
    SELECT representant_id
    FROM public.representants
    ORDER BY created_at
    LIMIT 1
),
representant_isole AS (
    INSERT INTO public.representants (
        code_representant,
        nom_representant,
        courriel
    )
    VALUES (
        '2026999988',
        'Représentant Isolation',
        'isolation@example.test'
    )
    RETURNING representant_id
),
client_isole AS (
    INSERT INTO public.clients (
        representant_id,
        nom_client,
        courriel,
        statut_dossier
    )
    SELECT
        representant_id,
        'Client Confidentiel Isolation',
        'client-isolation@example.test',
        'En analyse'
    FROM representant_isole
    RETURNING client_id, representant_id, code_client
)
INSERT INTO isolation_test_context (
    representant_principal_id,
    representant_isole_id,
    client_isole_id,
    client_isole_code
)
SELECT
    principal.representant_id,
    client_isole.representant_id,
    client_isole.client_id,
    client_isole.code_client
FROM principal
CROSS JOIN client_isole;

GRANT SELECT ON isolation_test_context TO crm_runtime;

SET ROLE crm_runtime;

DO $isolation$
DECLARE
    v_contexte isolation_test_context%ROWTYPE;
    v_resultat jsonb;
BEGIN
    SELECT * INTO v_contexte FROM isolation_test_context;

    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config(
        'app.representant_id',
        v_contexte.representant_principal_id::text,
        true
    );

    v_resultat := crm.obtenir_client(v_contexte.client_isole_id);
    IF COALESCE((v_resultat ->> 'trouve')::boolean, false) THEN
        RAISE EXCEPTION 'Le représentant principal voit un client isolé: %', v_resultat;
    END IF;

    v_resultat := crm.rechercher_clients('Client Confidentiel Isolation');
    IF (v_resultat ->> 'nombre_resultats')::integer IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'La recherche révèle un client isolé: %', v_resultat;
    END IF;

    -- Les vues Clients et Dossiers utilisent ce service. Une selection
    -- explicite du code d'un autre representant doit rester vide.
    v_resultat := crm.consulter_portefeuille(
        '{}'::jsonb,
        '[]'::jsonb,
        100,
        ARRAY[v_contexte.client_isole_code],
        NULL
    );
    IF (v_resultat ->> 'nombre_clients')::integer IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'Le portefeuille revele un client isole: %', v_resultat;
    END IF;

    BEGIN
        PERFORM client_id FROM public.clients LIMIT 1;
        RAISE EXCEPTION 'crm_runtime ne devrait jamais lire directement public.clients';
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL;
    END;

    PERFORM set_config(
        'app.representant_id',
        v_contexte.representant_isole_id::text,
        true
    );

    v_resultat := crm.obtenir_client(v_contexte.client_isole_id);
    IF NOT COALESCE((v_resultat ->> 'trouve')::boolean, false) THEN
        RAISE EXCEPTION 'Le représentant propriétaire ne voit pas son client: %', v_resultat;
    END IF;

    v_resultat := crm.consulter_portefeuille(
        '{}'::jsonb,
        '[]'::jsonb,
        100,
        ARRAY[v_contexte.client_isole_code],
        NULL
    );
    IF (v_resultat ->> 'nombre_clients')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Le portefeuille du proprietaire ne contient pas son client: %', v_resultat;
    END IF;
END
$isolation$;

RESET ROLE;
ROLLBACK;
