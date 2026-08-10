-- Vérifie le jeu de données fictives du MVP sans le modifier.

DO $test$
DECLARE
    v_representant_id uuid;
    v_resultat jsonb;
BEGIN
    SELECT representant_id
    INTO v_representant_id
    FROM public.representants
    WHERE code_representant = '2026999999';

    IF v_representant_id IS NULL THEN
        RAISE EXCEPTION 'Le représentant MVP est absent.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.clients
        WHERE client_id::text LIKE '10000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 12::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir douze clients fictifs.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.interactions
        WHERE interaction_id::text LIKE '20000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 3::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir trois interactions.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.documents_requis
        WHERE document_id::text LIKE '30000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 4::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir quatre documents.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.taches
        WHERE tache_id::text LIKE '40000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 3::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir trois tâches.';
    END IF;

    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);

    v_resultat := crm.obtenir_derniers_clients();

    IF (v_resultat ->> 'nombre_resultats')::integer IS DISTINCT FROM 10 THEN
        RAISE EXCEPTION 'Le service ne retourne pas dix clients: %', v_resultat;
    END IF;

    IF v_resultat #>> '{clients,0,nom_client}' IS DISTINCT FROM 'Olivier Bergeron' THEN
        RAISE EXCEPTION 'Le client le plus récent est inattendu: %', v_resultat;
    END IF;

    IF (v_resultat #> '{clients,0}') ? 'client_id' THEN
        RAISE EXCEPTION 'Le service ne doit pas exposer client_id: %', v_resultat;
    END IF;
END
$test$;
