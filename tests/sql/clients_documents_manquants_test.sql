-- Test transactionnel de crm.obtenir_clients_documents_manquants(integer).
-- Prérequis : migrations 001 à 010 appliquées par un administrateur.

BEGIN;

CREATE TEMPORARY TABLE documents_manquants_test_context (
    representant_test_id uuid NOT NULL,
    client_test_id uuid NOT NULL
) ON COMMIT DROP;

WITH representant_test AS (
    INSERT INTO public.representants (
        code_representant, nom_representant, courriel
    ) VALUES (
        '2026999995', 'Représentant Documents Manquants',
        'documents-manquants@example.test'
    ) RETURNING representant_id
), client_test AS (
    INSERT INTO public.clients (
        representant_id, nom_client, courriel, statut_dossier
    )
    SELECT representant_id, 'Client Documents Test',
        'client-documents@example.test', 'Documents requis'
    FROM representant_test
    RETURNING client_id, representant_id
)
INSERT INTO documents_manquants_test_context (
    representant_test_id, client_test_id
)
SELECT representant_id, client_id FROM client_test;

INSERT INTO public.documents_requis (
    client_id, representant_id, document, statut, date_demande
)
SELECT contexte.client_test_id, contexte.representant_test_id,
    document.nom, document.statut, date '2026-08-10'
FROM documents_manquants_test_context contexte
CROSS JOIN (VALUES
    ('Preuve de revenu', 'A recevoir'),
    ('Relevé bancaire', 'En attente'),
    ('Pièce d’identité', 'Reçu')
) AS document(nom, statut);

WITH representant_isole AS (
    INSERT INTO public.representants (
        code_representant, nom_representant, courriel
    ) VALUES (
        '2026999994', 'Représentant Documents Isolé',
        'documents-isoles@example.test'
    ) RETURNING representant_id
), client_isole AS (
    INSERT INTO public.clients (
        representant_id, nom_client, courriel, statut_dossier
    )
    SELECT representant_id, 'Client Documents Isolé',
        'client-documents-isole@example.test', 'Documents requis'
    FROM representant_isole
    RETURNING client_id, representant_id
)
INSERT INTO public.documents_requis (
    client_id, representant_id, document, statut
)
SELECT client_id, representant_id, 'Document secret', 'A recevoir'
FROM client_isole;

GRANT SELECT ON documents_manquants_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v_representant_id uuid;
    v_resultat jsonb;
BEGIN
    SELECT representant_test_id INTO v_representant_id
    FROM documents_manquants_test_context;

    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);
    v_resultat := crm.obtenir_clients_documents_manquants(20);

    IF (v_resultat ->> 'nombre_clients')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Nombre de clients inattendu: %', v_resultat;
    END IF;
    IF v_resultat #>> '{clients,0,nom_client}'
        IS DISTINCT FROM 'Client Documents Test' THEN
        RAISE EXCEPTION 'Client inattendu: %', v_resultat;
    END IF;
    IF (v_resultat #>> '{clients,0,nombre_documents_manquants}')::integer
        IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Nombre de documents inattendu: %', v_resultat;
    END IF;
    IF (v_resultat #> '{clients,0}') ? 'client_id' THEN
        RAISE EXCEPTION 'Le service expose client_id: %', v_resultat;
    END IF;
    IF v_resultat::text LIKE '%Document secret%' THEN
        RAISE EXCEPTION 'La RLS a révélé un autre portefeuille: %', v_resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
