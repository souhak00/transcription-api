-- Test d'acceptation dépendant du jeu de données CRM local validé.
-- Exécution suggérée :
-- psql -v ON_ERROR_STOP=1 -f tests/sql/tremblay_acceptance_test.sql

BEGIN;

DO $test$
DECLARE
    v_recherche jsonb;
    v_client_id uuid;
    v_etat jsonb;
    v_documents jsonb;
BEGIN
    PERFORM set_config('app.role', 'admin', true);

    v_recherche := crm.rechercher_clients('Tremblay');

    IF (v_recherche ->> 'nombre_resultats')::integer < 3 THEN
        RAISE EXCEPTION 'Au moins trois correspondances Tremblay étaient attendues: %', v_recherche;
    END IF;

    SELECT (item ->> 'client_id')::uuid
    INTO STRICT v_client_id
    FROM jsonb_array_elements(v_recherche -> 'resultats') AS item
    WHERE item ->> 'nom_client' = 'Tremblay';

    v_etat := crm.obtenir_etat_dossier(v_client_id);

    IF NOT COALESCE((v_etat ->> 'trouve')::boolean, false) THEN
        RAISE EXCEPTION 'Le dossier Tremblay devrait être trouvé: %', v_etat;
    END IF;
    IF v_etat ->> 'etat' IS DISTINCT FROM 'Nouveau' THEN
        RAISE EXCEPTION 'État attendu Nouveau, reçu %', v_etat ->> 'etat';
    END IF;
    IF (v_etat #>> '{resume_dossier,nombre_interactions}')::integer IS DISTINCT FROM 4 THEN
        RAISE EXCEPTION 'Quatre interactions étaient attendues';
    END IF;
    IF (v_etat #>> '{resume_dossier,nombre_documents_manquants}')::integer IS DISTINCT FROM 3 THEN
        RAISE EXCEPTION 'Trois documents manquants étaient attendus';
    END IF;
    IF (v_etat #>> '{resume_dossier,nombre_taches_ouvertes}')::integer IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Une tâche ouverte était attendue';
    END IF;

    SELECT COALESCE(jsonb_agg(item ->> 'document'), '[]'::jsonb)
    INTO v_documents
    FROM jsonb_array_elements(v_etat -> 'documents_manquants') AS item;

    IF jsonb_array_length(v_documents) IS DISTINCT FROM 3
       OR (
           SELECT COUNT(*)
           FROM jsonb_array_elements_text(v_documents) AS document(nom)
           WHERE nom IN (
               'Lettre d''emploi',
               'Montant de la dette',
               U&'\00C9tat civil'
           )
       ) IS DISTINCT FROM 3::bigint THEN
        RAISE EXCEPTION 'Documents manquants inattendus: %', v_documents;
    END IF;

    IF v_etat ->> 'prochaine_action'
       IS DISTINCT FROM 'Transfert des documents requis le lundi 8 juin' THEN
        RAISE EXCEPTION 'Prochaine action inattendue: %', v_etat ->> 'prochaine_action';
    END IF;
END
$test$;

ROLLBACK;
