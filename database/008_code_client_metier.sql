-- Ajoute un identifiant metier lisible et immuable aux fiches client.
-- Exemple : CLI-2026-OB-000012.

CREATE SEQUENCE IF NOT EXISTS crm.client_code_seq AS bigint;

ALTER SEQUENCE crm.client_code_seq OWNER TO crm_service_owner;

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS code_client text;

CREATE OR REPLACE FUNCTION crm.calculer_initiales_client(p_nom_client text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $function$
DECLARE
    v_nom text;
    v_prenom text;
    v_nom_famille text;
    v_mots text[];
    v_initiales text;
BEGIN
    v_nom := UPPER(
        TRANSLATE(
            BTRIM(p_nom_client),
            'ÀÂÄÁÃÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸŒÆ',
            'AAAAAACEEEEIIIINOOOOOUUUUYYOA'
        )
    );
    v_nom := REGEXP_REPLACE(v_nom, '[^A-Z, ]', '', 'g');
    v_nom := REGEXP_REPLACE(v_nom, '[[:space:]]+', ' ', 'g');

    IF v_nom = '' THEN
        RETURN 'XX';
    END IF;

    IF POSITION(',' IN v_nom) > 0 THEN
        v_nom_famille := BTRIM(SPLIT_PART(v_nom, ',', 1));
        v_prenom := BTRIM(SPLIT_PART(v_nom, ',', 2));
        v_initiales := LEFT(v_prenom, 1) || LEFT(v_nom_famille, 1);
    ELSE
        v_mots := STRING_TO_ARRAY(v_nom, ' ');

        IF CARDINALITY(v_mots) = 1 THEN
            v_initiales := LEFT(v_mots[1], 2);
        ELSE
            v_initiales := LEFT(v_mots[1], 1)
                || LEFT(v_mots[CARDINALITY(v_mots)], 1);
        END IF;
    END IF;

    RETURN RPAD(COALESCE(NULLIF(v_initiales, ''), 'X'), 2, 'X');
END
$function$;

ALTER FUNCTION crm.calculer_initiales_client(text) OWNER TO crm_service_owner;
REVOKE EXECUTE ON FUNCTION crm.calculer_initiales_client(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION crm.attribuer_code_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, public
AS $function$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.code_client IS NOT NULL
       AND NEW.code_client IS DISTINCT FROM OLD.code_client THEN
        RAISE EXCEPTION 'code_client est immuable une fois attribue';
    END IF;

    IF TG_OP = 'INSERT' AND NULLIF(BTRIM(NEW.code_client), '') IS NULL THEN
        NEW.code_client := FORMAT(
            'CLI-%s-%s-%s',
            EXTRACT(
                YEAR FROM COALESCE(NEW.created_at, CURRENT_TIMESTAMP)
                    AT TIME ZONE 'America/Toronto'
            )::integer,
            crm.calculer_initiales_client(COALESCE(NEW.nom_client, '')),
            LPAD(NEXTVAL('crm.client_code_seq'::regclass)::text, 6, '0')
        );
    END IF;

    RETURN NEW;
END
$function$;

ALTER FUNCTION crm.attribuer_code_client() OWNER TO crm_service_owner;
REVOKE EXECUTE ON FUNCTION crm.attribuer_code_client() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clients_code_client ON public.clients;
CREATE TRIGGER trg_clients_code_client
BEFORE INSERT OR UPDATE OF code_client ON public.clients
FOR EACH ROW
EXECUTE FUNCTION crm.attribuer_code_client();

WITH codes_a_attribuer AS (
    SELECT
        c.client_id,
        NEXTVAL('crm.client_code_seq'::regclass) AS numero
    FROM public.clients c
    WHERE NULLIF(BTRIM(c.code_client), '') IS NULL
    ORDER BY c.created_at, c.client_id
)
UPDATE public.clients c
SET code_client = FORMAT(
    'CLI-%s-%s-%s',
    EXTRACT(YEAR FROM c.created_at AT TIME ZONE 'America/Toronto')::integer,
    crm.calculer_initiales_client(COALESCE(c.nom_client, '')),
    LPAD(codes_a_attribuer.numero::text, 6, '0')
)
FROM codes_a_attribuer
WHERE c.client_id = codes_a_attribuer.client_id;

SELECT SETVAL(
    'crm.client_code_seq'::regclass,
    GREATEST(
        1,
        COALESCE(
            (
                SELECT MAX(RIGHT(c.code_client, 6)::bigint)
                FROM public.clients c
                WHERE c.code_client ~ '^CLI-[0-9]{4}-[A-Z]{2}-[0-9]{6}$'
            ),
            0
        )
    ),
    true
);

ALTER TABLE public.clients
    ALTER COLUMN code_client SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clients_code_client
    ON public.clients (code_client);

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.clients'::regclass
          AND conname = 'chk_clients_code_client_format'
    ) THEN
        ALTER TABLE public.clients
            ADD CONSTRAINT chk_clients_code_client_format
            CHECK (code_client ~ '^CLI-[0-9]{4}-[A-Z]{2}-[0-9]{6}$');
    END IF;
END
$constraints$;

COMMENT ON COLUMN public.clients.code_client IS
    'Identifiant metier public et immuable au format CLI-AAAA-II-NNNNNN.';

CREATE OR REPLACE FUNCTION crm.rechercher_clients_agent(p_terme text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'terme_recherche', p_terme,
        'nombre_resultats', COUNT(*),
        'resultats',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'code_client', c.code_client,
                    'nom_client', c.nom_client,
                    'type_transaction', c.type_transaction,
                    'objectif', c.objectif,
                    'statut_dossier', c.statut_dossier
                )
                ORDER BY c.updated_at DESC
            ),
            '[]'::jsonb
        )
    )
    FROM public.clients c
    WHERE NULLIF(BTRIM(p_terme), '') IS NOT NULL
      AND (
            c.code_client ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.nom_client ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.telephone ILIKE '%' || BTRIM(p_terme) || '%'
         OR c.courriel ILIKE '%' || BTRIM(p_terme) || '%'
      );
$function$;

ALTER FUNCTION crm.rechercher_clients_agent(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.rechercher_clients_agent(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.rechercher_clients_agent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rechercher_clients_agent(text) TO crm_runtime;

COMMENT ON FUNCTION crm.rechercher_clients_agent(text) IS
    'Recherche des clients pour un agent et retourne code_client sans UUID.';

CREATE OR REPLACE FUNCTION crm.obtenir_documents_client(p_code_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH scores AS MATERIALIZED (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            CASE
                WHEN UPPER(COALESCE(p_code_client, '')) LIKE '%' || c.code_client || '%'
                    THEN 1000
                ELSE (
                    SELECT COUNT(*)
                    FROM regexp_split_to_table(
                        UPPER(COALESCE(c.nom_client, '')),
                        '[^[:alnum:]]+'
                    ) AS mot(valeur)
                    WHERE CHAR_LENGTH(mot.valeur) >= 2
                      AND UPPER(COALESCE(p_code_client, ''))
                            LIKE '%' || mot.valeur || '%'
                )
            END AS score
        FROM public.clients c
    ),
    correspondances AS MATERIALIZED (
        SELECT
            s.client_id,
            s.code_client,
            s.nom_client,
            COUNT(*) OVER () AS nombre_correspondances
        FROM scores s
        WHERE s.score > 0
          AND s.score = (SELECT MAX(s2.score) FROM scores s2)
    ),
    cible AS MATERIALIZED (
        SELECT c.client_id, c.code_client, c.nom_client
        FROM correspondances c
        WHERE c.nombre_correspondances = 1
    ),
    documents AS (
        SELECT
            COUNT(d.document_id) AS nombre_documents,
            COUNT(d.document_id) FILTER (
                WHERE LOWER(COALESCE(d.statut, '')) IN (
                    'a recevoir', 'à recevoir', 'manquant', 'en attente'
                )
            ) AS nombre_documents_manquants,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'document', d.document,
                        'statut', d.statut,
                        'date_demande', d.date_demande,
                        'created_at', d.created_at
                    )
                    ORDER BY d.date_demande DESC, d.created_at DESC
                ) FILTER (WHERE d.document_id IS NOT NULL),
                '[]'::jsonb
            ) AS elements
        FROM cible c
        LEFT JOIN public.documents_requis d ON d.client_id = c.client_id
    )
    SELECT jsonb_build_object(
        'trouve', EXISTS (SELECT 1 FROM cible),
        'ambigue', (SELECT COUNT(*) FROM correspondances) > 1,
        'nombre_correspondances', (SELECT COUNT(*) FROM correspondances),
        'correspondances', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'code_client', c.code_client,
                        'nom_client', c.nom_client
                    )
                    ORDER BY c.nom_client, c.code_client
                )
                FROM correspondances c
            ),
            '[]'::jsonb
        ),
        'code_client', (SELECT c.code_client FROM cible c),
        'nom_client', (SELECT c.nom_client FROM cible c),
        'nombre_documents', COALESCE((SELECT d.nombre_documents FROM documents d), 0),
        'nombre_documents_manquants',
            COALESCE((SELECT d.nombre_documents_manquants FROM documents d), 0),
        'documents', COALESCE((SELECT d.elements FROM documents d), '[]'::jsonb)
    );
$function$;

ALTER FUNCTION crm.obtenir_documents_client(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_documents_client(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_documents_client(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_documents_client(text) TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_documents_client(text) IS
    'Retourne les documents visibles d un client designe par son code metier ou son nom.';

CREATE OR REPLACE FUNCTION crm.obtenir_taches_client(p_code_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH scores AS MATERIALIZED (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            CASE
                WHEN UPPER(COALESCE(p_code_client, '')) LIKE '%' || c.code_client || '%'
                    THEN 1000
                ELSE (
                    SELECT COUNT(*)
                    FROM regexp_split_to_table(
                        UPPER(COALESCE(c.nom_client, '')),
                        '[^[:alnum:]]+'
                    ) AS mot(valeur)
                    WHERE CHAR_LENGTH(mot.valeur) >= 2
                      AND UPPER(COALESCE(p_code_client, ''))
                            LIKE '%' || mot.valeur || '%'
                )
            END AS score
        FROM public.clients c
    ),
    correspondances AS MATERIALIZED (
        SELECT
            s.client_id,
            s.code_client,
            s.nom_client,
            COUNT(*) OVER () AS nombre_correspondances
        FROM scores s
        WHERE s.score > 0
          AND s.score = (SELECT MAX(s2.score) FROM scores s2)
    ),
    cible AS MATERIALIZED (
        SELECT c.client_id, c.code_client, c.nom_client
        FROM correspondances c
        WHERE c.nombre_correspondances = 1
    ),
    taches_client AS (
        SELECT
            COUNT(t.tache_id) AS nombre_taches,
            COUNT(t.tache_id) FILTER (
                WHERE LOWER(COALESCE(t.statut, '')) IN (
                    'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                )
            ) AS nombre_taches_ouvertes,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'titre', t.titre,
                        'description', t.description,
                        'date_echeance', t.date_echeance,
                        'statut', t.statut,
                        'created_at', t.created_at
                    )
                    ORDER BY
                        CASE
                            WHEN LOWER(COALESCE(t.statut, '')) IN (
                                'ouverte', 'ouvert', 'en cours', 'à faire', 'a faire'
                            ) THEN 0
                            ELSE 1
                        END,
                        t.date_echeance ASC NULLS LAST,
                        t.created_at DESC
                ) FILTER (WHERE t.tache_id IS NOT NULL),
                '[]'::jsonb
            ) AS elements
        FROM cible c
        LEFT JOIN public.taches t ON t.client_id = c.client_id
    )
    SELECT jsonb_build_object(
        'trouve', EXISTS (SELECT 1 FROM cible),
        'ambigue', (SELECT COUNT(*) FROM correspondances) > 1,
        'nombre_correspondances', (SELECT COUNT(*) FROM correspondances),
        'correspondances', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'code_client', c.code_client,
                        'nom_client', c.nom_client
                    )
                    ORDER BY c.nom_client, c.code_client
                )
                FROM correspondances c
            ),
            '[]'::jsonb
        ),
        'code_client', (SELECT c.code_client FROM cible c),
        'nom_client', (SELECT c.nom_client FROM cible c),
        'nombre_taches', COALESCE((SELECT t.nombre_taches FROM taches_client t), 0),
        'nombre_taches_ouvertes',
            COALESCE((SELECT t.nombre_taches_ouvertes FROM taches_client t), 0),
        'taches', COALESCE((SELECT t.elements FROM taches_client t), '[]'::jsonb)
    );
$function$;

ALTER FUNCTION crm.obtenir_taches_client(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_taches_client(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_taches_client(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_taches_client(text) TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_taches_client(text) IS
    'Retourne les taches visibles d un client designe par son code metier ou son nom.';

CREATE OR REPLACE FUNCTION crm.obtenir_derniers_clients()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH derniers AS (
        SELECT
            c.client_id,
            c.code_client,
            c.nom_client,
            c.type_transaction,
            c.statut_dossier,
            c.created_at
        FROM public.clients c
        ORDER BY c.created_at DESC, c.client_id DESC
        LIMIT 10
    )
    SELECT jsonb_build_object(
        'limite', 10,
        'nombre_resultats', COUNT(*),
        'clients',
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'code_client', d.code_client,
                    'nom_client', d.nom_client,
                    'type_transaction', d.type_transaction,
                    'statut_dossier', d.statut_dossier,
                    'created_at', d.created_at
                )
                ORDER BY d.created_at DESC, d.client_id DESC
            ),
            '[]'::jsonb
        )
    )
    FROM derniers d;
$function$;

ALTER FUNCTION crm.obtenir_derniers_clients() OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_derniers_clients()
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_derniers_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_derniers_clients() TO crm_runtime;

COMMENT ON FUNCTION crm.obtenir_derniers_clients() IS
    'Retourne les dix derniers clients visibles avec leur code metier, sans UUID.';
