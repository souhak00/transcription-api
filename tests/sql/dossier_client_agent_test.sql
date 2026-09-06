-- Valide le contrat JSON sécurisé de la vue dossier client.
BEGIN;

SELECT set_config('app.role', 'representant', true);
SELECT set_config(
    'app.representant_id',
    'ac7b7a4b-907e-4733-a0de-4e5ed40e6af0',
    true
);

DO $test$
DECLARE
    v_resultat jsonb;
BEGIN
    v_resultat := crm.obtenir_dossier_client('CLI-2026-OB-000015');

    IF COALESCE((v_resultat ->> 'trouve')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Le dossier Olivier devrait être trouvé: %', v_resultat;
    END IF;

    IF v_resultat #>> '{dossier,nom_client}' IS DISTINCT FROM 'Olivier Bergeron' THEN
        RAISE EXCEPTION 'Client inattendu: %', v_resultat #>> '{dossier,nom_client}';
    END IF;

    IF (v_resultat #>> '{dossier,resume_dossier,nombre_documents_manquants}')::int
            IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Nombre de documents manquants inattendu: %', v_resultat;
    END IF;

    IF (v_resultat #>> '{dossier,resume_dossier,nombre_taches_ouvertes}')::int
            IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Nombre de tâches ouvertes inattendu: %', v_resultat;
    END IF;

    IF (v_resultat -> 'dossier') ? 'client_id'
       OR (v_resultat -> 'dossier') ? 'representant_id' THEN
        RAISE EXCEPTION 'Le contrat ne doit pas exposer d UUID: %', v_resultat;
    END IF;

    v_resultat := crm.obtenir_dossier_client('Tremblay');
    IF COALESCE((v_resultat ->> 'ambigue')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Tremblay devrait être ambigu: %', v_resultat;
    END IF;
END
$test$;

ROLLBACK;
