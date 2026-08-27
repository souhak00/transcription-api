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
    ) IS DISTINCT FROM 13::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir treize clients fictifs.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.interactions
        WHERE interaction_id::text LIKE '20000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 4::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir quatre interactions.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.documents_requis
        WHERE document_id::text LIKE '30000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 7::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir sept documents.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.taches
        WHERE tache_id::text LIKE '40000000-0000-4000-8000-0000000000%'
    ) IS DISTINCT FROM 4::bigint THEN
        RAISE EXCEPTION 'Le jeu de données doit contenir quatre tâches.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM public.details_hypothecaires
        WHERE detail_id = '50000000-0000-4000-8000-000000000013'::uuid
    ) IS DISTINCT FROM 1::bigint THEN
        RAISE EXCEPTION 'Les détails hypothécaires de Benoît Tremblay sont absents.';
    END IF;

    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v_representant_id::text, true);

    v_resultat := crm.obtenir_derniers_clients();

    IF (v_resultat ->> 'nombre_resultats')::integer IS DISTINCT FROM 10 THEN
        RAISE EXCEPTION 'Le service ne retourne pas dix clients: %', v_resultat;
    END IF;

    IF v_resultat #>> '{clients,0,nom_client}' IS DISTINCT FROM 'Benoît Tremblay' THEN
        RAISE EXCEPTION 'Le client le plus récent est inattendu: %', v_resultat;
    END IF;

    IF (v_resultat #> '{clients,0}') ? 'client_id' THEN
        RAISE EXCEPTION 'Le service ne doit pas exposer client_id: %', v_resultat;
    END IF;

    v_resultat := crm.obtenir_dossier_hypothecaire('Benoît Tremblay');

    IF v_resultat #>> '{dossier,details_hypothecaires,preteur}'
        IS DISTINCT FROM 'Banque Nationale' THEN
        RAISE EXCEPTION 'Le prêteur de démonstration est inattendu: %', v_resultat;
    END IF;

    IF (v_resultat #> '{dossier,details_hypothecaires}') ? 'detail_id' THEN
        RAISE EXCEPTION 'Le service hypothécaire ne doit pas exposer detail_id: %', v_resultat;
    END IF;

    IF v_resultat #>> '{dossier,profil_client,adresse,ville}' IS DISTINCT FROM 'Québec'
       OR v_resultat #>> '{dossier,projet_hypothecaire,type_propriete}'
            IS DISTINCT FROM 'Maison unifamiliale'
       OR v_resultat #>> '{dossier,participants,0,role}' IS DISTINCT FROM 'Codemandeur'
       OR jsonb_array_length(v_resultat #> '{dossier,consentements}') IS DISTINCT FROM 3 THEN
        RAISE EXCEPTION 'Le profil enrichi de démonstration est incomplet: %', v_resultat;
    END IF;
END
$test$;
