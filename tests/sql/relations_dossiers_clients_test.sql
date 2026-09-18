BEGIN;

CREATE TEMPORARY TABLE relation_test_context (
    representant_id uuid NOT NULL,
    autre_representant_id uuid NOT NULL,
    code_dossier text,
    client_principal_code text,
    codemandeur_code text
) ON COMMIT DROP;

WITH representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999990', 'Representant Relation Test')
    RETURNING representant_id
), autre_representant AS (
    INSERT INTO public.representants (code_representant, nom_representant)
    VALUES ('2026999989', 'Autre Representant Relation Test')
    RETURNING representant_id
)
INSERT INTO relation_test_context (representant_id, autre_representant_id)
SELECT r.representant_id, ar.representant_id
FROM representant r CROSS JOIN autre_representant ar;

INSERT INTO public.clients (representant_id, nom_client, courriel)
SELECT representant_id, 'Client Principal Relation', 'principal-relation@example.test'
FROM relation_test_context;

INSERT INTO public.clients (representant_id, nom_client, courriel)
SELECT representant_id, 'Client Codemandeur Relation', 'codemandeur-relation@example.test'
FROM relation_test_context;

UPDATE relation_test_context ctx
SET
    client_principal_code = p.code_client,
    codemandeur_code = co.code_client,
    code_dossier = d.code_dossier
FROM public.clients p
JOIN public.dossier_clients dc ON dc.client_id = p.client_id AND dc.est_principal
JOIN public.dossiers_hypothecaires d ON d.dossier_id = dc.dossier_id
CROSS JOIN public.clients co
WHERE p.courriel = 'principal-relation@example.test'
  AND co.courriel = 'codemandeur-relation@example.test';

GRANT SELECT ON relation_test_context TO crm_runtime;
SET ROLE crm_runtime;

DO $test$
DECLARE
    v relation_test_context%ROWTYPE;
    resultat jsonb;
BEGIN
    SELECT * INTO v FROM relation_test_context;
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config('app.representant_id', v.representant_id::text, true);

    resultat := crm.associer_client_dossier(
        v.code_dossier, v.codemandeur_code, 'Codemandeur', false
    );
    IF COALESCE((resultat ->> 'associe')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Association refusee: %', resultat;
    END IF;

    resultat := crm.obtenir_relation_dossier(v.code_dossier);
    IF (resultat ->> 'nombre_clients')::integer IS DISTINCT FROM 2
       OR resultat #>> '{clients,0,role_client}' IS DISTINCT FROM 'Demandeur principal'
       OR resultat #>> '{clients,1,role_client}' IS DISTINCT FROM 'Codemandeur' THEN
        RAISE EXCEPTION 'Relation dossier invalide: %', resultat;
    END IF;

    resultat := crm.obtenir_dossier_hypothecaire(v.client_principal_code);
    IF resultat #>> '{dossier,code_dossier}' IS DISTINCT FROM v.code_dossier
       OR (resultat #>> '{dossier,relation_dossier,nombre_clients}')::integer
            IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'Dossier enrichi invalide: %', resultat;
    END IF;

    PERFORM set_config('app.representant_id', v.autre_representant_id::text, true);
    resultat := crm.obtenir_relation_dossier(v.code_dossier);
    IF COALESCE((resultat ->> 'trouve')::boolean, false) THEN
        RAISE EXCEPTION 'Un autre representant voit le dossier: %', resultat;
    END IF;
END
$test$;

RESET ROLE;
ROLLBACK;
