-- Teste les contrats JSON des services agent fondes sur code_client.
-- Prerequis : jeu de donnees MVP charge et migrations 001 a 008 appliquees.

BEGIN;

SET ROLE crm_runtime;

DO $test$
DECLARE
    v_recherche jsonb;
    v_documents jsonb;
    v_taches jsonb;
    v_derniers jsonb;
    v_code_client text;
BEGIN
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config(
        'app.representant_id',
        'ac7b7a4b-907e-4733-a0de-4e5ed40e6af0',
        true
    );

    v_recherche := crm.rechercher_clients_agent('Olivier Bergeron');

    IF (v_recherche ->> 'nombre_resultats')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Un client Olivier Bergeron etait attendu: %', v_recherche;
    END IF;

    IF (v_recherche #> '{resultats,0}') ? 'client_id' THEN
        RAISE EXCEPTION 'La recherche agent expose client_id: %', v_recherche;
    END IF;

    v_code_client := v_recherche #>> '{resultats,0,code_client}';

    IF v_code_client !~ '^CLI-2026-OB-[0-9]{6}$' THEN
        RAISE EXCEPTION 'Code Olivier inattendu: %', v_code_client;
    END IF;

    v_documents := crm.obtenir_documents_client(v_code_client);

    IF (v_documents ->> 'trouve')::boolean IS DISTINCT FROM true
       OR (v_documents ->> 'nombre_documents')::integer IS DISTINCT FROM 3
       OR (v_documents ->> 'nombre_documents_manquants')::integer IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Documents Olivier inattendus: %', v_documents;
    END IF;

    IF v_documents::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
        RAISE EXCEPTION 'Le service documents expose un UUID: %', v_documents;
    END IF;

    v_documents := crm.obtenir_documents_client('Olivier Bergeron');

    IF (v_documents ->> 'trouve')::boolean IS DISTINCT FROM true
       OR v_documents ->> 'code_client' IS DISTINCT FROM v_code_client THEN
        RAISE EXCEPTION 'La resolution directe par nom a echoue: %', v_documents;
    END IF;

    v_documents := crm.obtenir_documents_client(
        'Quels documents manquent pour Olivier Bergeron ?'
    );

    IF (v_documents ->> 'trouve')::boolean IS DISTINCT FROM true
       OR (v_documents ->> 'nombre_documents_manquants')::integer IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'La resolution du message complet a echoue: %', v_documents;
    END IF;

    v_taches := crm.obtenir_taches_client(v_code_client);

    IF (v_taches ->> 'trouve')::boolean IS DISTINCT FROM true
       OR (v_taches ->> 'nombre_taches')::integer IS DISTINCT FROM 1
       OR (v_taches ->> 'nombre_taches_ouvertes')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Taches Olivier inattendues: %', v_taches;
    END IF;

    IF v_taches::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN
        RAISE EXCEPTION 'Le service taches expose un UUID: %', v_taches;
    END IF;

    v_documents := crm.obtenir_documents_client('Tremblay');

    IF (v_documents ->> 'ambigue')::boolean IS DISTINCT FROM true
       OR (v_documents ->> 'nombre_correspondances')::integer < 2 THEN
        RAISE EXCEPTION 'La resolution devrait signaler Tremblay comme ambigu: %', v_documents;
    END IF;

    v_derniers := crm.obtenir_derniers_clients();

    IF NOT ((v_derniers #> '{clients,0}') ? 'code_client')
       OR (v_derniers #> '{clients,0}') ? 'client_id' THEN
        RAISE EXCEPTION 'Contrat des derniers clients inattendu: %', v_derniers;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
