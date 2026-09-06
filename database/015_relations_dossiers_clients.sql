-- Formalise le dossier hypothecaire comme agregat metier distinct du client.
-- Un dossier appartient a un representant et peut contenir un ou plusieurs clients.

CREATE SEQUENCE IF NOT EXISTS crm.dossier_code_seq AS bigint;
ALTER SEQUENCE crm.dossier_code_seq OWNER TO crm_service_owner;

CREATE TABLE IF NOT EXISTS public.dossiers_hypothecaires (
    dossier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    code_dossier text NOT NULL UNIQUE,
    statut_dossier text NOT NULL DEFAULT 'Nouveau',
    type_transaction text,
    objectif text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_dossiers_code_format
        CHECK (code_dossier ~ '^DOS-[0-9]{4}-[A-Z]{2}-[0-9]{6}$'),
    CONSTRAINT uq_dossiers_id_representant UNIQUE (dossier_id, representant_id)
);

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.clients'::regclass
          AND conname = 'uq_clients_id_representant'
    ) THEN
        ALTER TABLE public.clients
            ADD CONSTRAINT uq_clients_id_representant
            UNIQUE (client_id, representant_id);
    END IF;
END
$constraints$;

CREATE TABLE IF NOT EXISTS public.dossier_clients (
    dossier_id uuid NOT NULL,
    client_id uuid NOT NULL,
    representant_id uuid NOT NULL,
    role_client text NOT NULL DEFAULT 'Demandeur principal',
    est_principal boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dossier_id, client_id),
    CONSTRAINT fk_dossier_clients_dossier_representant
        FOREIGN KEY (dossier_id, representant_id)
        REFERENCES public.dossiers_hypothecaires(dossier_id, representant_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_dossier_clients_client_representant
        FOREIGN KEY (client_id, representant_id)
        REFERENCES public.clients(client_id, representant_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_dossier_clients_role CHECK (
        lower(role_client) IN (
            'demandeur principal', 'codemandeur', 'coemprunteur',
            'conjoint', 'garant', 'caution', 'autre'
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dossier_clients_principal
    ON public.dossier_clients(dossier_id)
    WHERE est_principal;
CREATE INDEX IF NOT EXISTS ix_dossier_clients_client
    ON public.dossier_clients(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dossiers_representant
    ON public.dossiers_hypothecaires(representant_id, updated_at DESC);

CREATE OR REPLACE FUNCTION crm.attribuer_code_dossier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, public
AS $function$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.code_dossier IS NOT NULL
       AND NEW.code_dossier IS DISTINCT FROM OLD.code_dossier THEN
        RAISE EXCEPTION 'code_dossier_immuable';
    END IF;

    IF TG_OP = 'INSERT' AND NULLIF(btrim(NEW.code_dossier), '') IS NULL THEN
        NEW.code_dossier := format(
            'DOS-%s-XX-%s',
            extract(year FROM COALESCE(NEW.created_at, now())
                AT TIME ZONE 'America/Toronto')::integer,
            lpad(nextval('crm.dossier_code_seq'::regclass)::text, 6, '0')
        );
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION crm.attribuer_code_dossier() OWNER TO crm_service_owner;
REVOKE EXECUTE ON FUNCTION crm.attribuer_code_dossier() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_dossiers_code_dossier
    ON public.dossiers_hypothecaires;
CREATE TRIGGER trg_dossiers_code_dossier
BEFORE INSERT OR UPDATE OF code_dossier ON public.dossiers_hypothecaires
FOR EACH ROW EXECUTE FUNCTION crm.attribuer_code_dossier();

-- Reprise sans perte : chaque fiche client existante devient le demandeur
-- principal d'un dossier. Des clients additionnels pourront ensuite etre lies.
INSERT INTO public.dossiers_hypothecaires (
    representant_id, code_dossier, statut_dossier,
    type_transaction, objectif, created_at, updated_at
)
SELECT
    c.representant_id,
    regexp_replace(c.code_client, '^CLI-', 'DOS-'),
    c.statut_dossier,
    c.type_transaction,
    c.objectif,
    c.created_at,
    c.updated_at
FROM public.clients c
WHERE NOT EXISTS (
    SELECT 1 FROM public.dossier_clients dc WHERE dc.client_id = c.client_id
)
ORDER BY c.created_at, c.client_id;

INSERT INTO public.dossier_clients (
    dossier_id, client_id, representant_id, role_client, est_principal, created_at
)
SELECT
    d.dossier_id,
    c.client_id,
    c.representant_id,
    'Demandeur principal',
    true,
    c.created_at
FROM public.clients c
JOIN LATERAL (
    SELECT d1.dossier_id
    FROM public.dossiers_hypothecaires d1
    WHERE d1.representant_id = c.representant_id
      AND d1.code_dossier = regexp_replace(c.code_client, '^CLI-', 'DOS-')
    LIMIT 1
) d ON true
WHERE NOT EXISTS (
    SELECT 1 FROM public.dossier_clients dc WHERE dc.client_id = c.client_id
);

SELECT setval(
    'crm.dossier_code_seq'::regclass,
    greatest(
        1,
        COALESCE((
            SELECT max(right(d.code_dossier, 6)::bigint)
            FROM public.dossiers_hypothecaires d
        ), 0)
    ),
    true
);

ALTER TABLE public.dossiers_hypothecaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers_hypothecaires FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossier_clients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dossiers_hypothecaires_access_policy
    ON public.dossiers_hypothecaires;
CREATE POLICY dossiers_hypothecaires_access_policy
ON public.dossiers_hypothecaires
USING (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
    OR (
        current_setting('app.role', true) = 'client'
        AND EXISTS (
            SELECT 1 FROM public.dossier_clients dc
            WHERE dc.dossier_id = dossiers_hypothecaires.dossier_id
              AND dc.client_id::text = current_setting('app.client_id', true)
        )
    )
)
WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
);

DROP POLICY IF EXISTS dossier_clients_access_policy ON public.dossier_clients;
CREATE POLICY dossier_clients_access_policy
ON public.dossier_clients
USING (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
    OR (
        current_setting('app.role', true) = 'client'
        AND client_id::text = current_setting('app.client_id', true)
    )
)
WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
);

GRANT SELECT, INSERT, UPDATE ON public.dossiers_hypothecaires
    TO crm_service_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_clients
    TO crm_service_owner;

CREATE OR REPLACE FUNCTION crm.creer_dossier_pour_nouveau_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, public
AS $function$
DECLARE
    v_dossier_id uuid;
BEGIN
    IF current_setting('app.role', true) IS NULL
       OR current_setting('app.role', true) = '' THEN
        PERFORM set_config('app.role', 'representant', true);
        PERFORM set_config('app.representant_id', NEW.representant_id::text, true);
    ELSIF current_setting('app.role', true) = 'representant'
       AND current_setting('app.representant_id', true) IS DISTINCT FROM NEW.representant_id::text THEN
        RAISE EXCEPTION 'representant_incompatible_avec_client';
    END IF;

    INSERT INTO public.dossiers_hypothecaires (
        representant_id, code_dossier, statut_dossier,
        type_transaction, objectif, created_at, updated_at
    ) VALUES (
        NEW.representant_id, NULL, NEW.statut_dossier,
        NEW.type_transaction, NEW.objectif, NEW.created_at, NEW.updated_at
    )
    RETURNING dossier_id INTO v_dossier_id;

    INSERT INTO public.dossier_clients (
        dossier_id, client_id, representant_id, role_client, est_principal
    ) VALUES (
        v_dossier_id, NEW.client_id, NEW.representant_id,
        'Demandeur principal', true
    );
    RETURN NEW;
END
$function$;

ALTER FUNCTION crm.creer_dossier_pour_nouveau_client() OWNER TO crm_service_owner;
REVOKE EXECUTE ON FUNCTION crm.creer_dossier_pour_nouveau_client() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_clients_creer_dossier ON public.clients;
CREATE TRIGGER trg_clients_creer_dossier
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION crm.creer_dossier_pour_nouveau_client();

-- Le detail financier est maintenant rattache explicitement au dossier.
ALTER TABLE public.details_hypothecaires
    ADD COLUMN IF NOT EXISTS dossier_id uuid;

UPDATE public.details_hypothecaires h
SET dossier_id = dc.dossier_id
FROM public.dossier_clients dc
WHERE dc.client_id = h.client_id
  AND dc.representant_id = h.representant_id
  AND dc.est_principal
  AND h.dossier_id IS NULL;

DO $constraints$
BEGIN
    IF EXISTS (SELECT 1 FROM public.details_hypothecaires WHERE dossier_id IS NULL) THEN
        RAISE EXCEPTION 'details_hypothecaires_sans_dossier';
    END IF;
    ALTER TABLE public.details_hypothecaires
        ALTER COLUMN dossier_id SET NOT NULL;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.details_hypothecaires'::regclass
          AND conname = 'fk_details_dossier_representant'
    ) THEN
        ALTER TABLE public.details_hypothecaires
            ADD CONSTRAINT fk_details_dossier_representant
            FOREIGN KEY (dossier_id, representant_id)
            REFERENCES public.dossiers_hypothecaires(dossier_id, representant_id);
    END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS ix_details_hypothecaires_dossier
    ON public.details_hypothecaires(dossier_id);

CREATE OR REPLACE FUNCTION crm.completer_dossier_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, crm, public
AS $function$
BEGIN
    IF NEW.dossier_id IS NULL THEN
        SELECT dc.dossier_id INTO NEW.dossier_id
        FROM public.dossier_clients dc
        WHERE dc.client_id = NEW.client_id
          AND dc.representant_id = NEW.representant_id
        ORDER BY dc.est_principal DESC, dc.created_at DESC
        LIMIT 1;
    END IF;
    IF NEW.dossier_id IS NULL THEN
        RAISE EXCEPTION 'dossier_introuvable_pour_client';
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION crm.completer_dossier_details() OWNER TO crm_service_owner;
REVOKE EXECUTE ON FUNCTION crm.completer_dossier_details() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_details_completer_dossier
    ON public.details_hypothecaires;
CREATE TRIGGER trg_details_completer_dossier
BEFORE INSERT OR UPDATE OF client_id, representant_id, dossier_id
ON public.details_hypothecaires
FOR EACH ROW EXECUTE FUNCTION crm.completer_dossier_details();

CREATE OR REPLACE FUNCTION crm.associer_client_dossier(
    p_code_dossier text,
    p_code_client text,
    p_role_client text DEFAULT 'Codemandeur',
    p_est_principal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_dossier public.dossiers_hypothecaires%ROWTYPE;
    v_client public.clients%ROWTYPE;
BEGIN
    SELECT d.* INTO v_dossier
    FROM public.dossiers_hypothecaires d
    WHERE d.code_dossier = upper(trim(p_code_dossier));

    SELECT c.* INTO v_client
    FROM public.clients c
    WHERE c.code_client = upper(trim(p_code_client));

    IF v_dossier.dossier_id IS NULL OR v_client.client_id IS NULL THEN
        RAISE EXCEPTION 'dossier_ou_client_introuvable';
    END IF;
    IF v_dossier.representant_id <> v_client.representant_id THEN
        RAISE EXCEPTION 'representants_incompatibles';
    END IF;

    IF p_est_principal THEN
        UPDATE public.dossier_clients
        SET est_principal = false,
            role_client = CASE
                WHEN lower(role_client) = 'demandeur principal' THEN 'Codemandeur'
                ELSE role_client
            END
        WHERE dossier_id = v_dossier.dossier_id AND est_principal;
    END IF;

    INSERT INTO public.dossier_clients (
        dossier_id, client_id, representant_id, role_client, est_principal
    ) VALUES (
        v_dossier.dossier_id, v_client.client_id, v_dossier.representant_id,
        CASE WHEN p_est_principal THEN 'Demandeur principal'
             ELSE initcap(lower(trim(p_role_client))) END,
        p_est_principal
    )
    ON CONFLICT (dossier_id, client_id) DO UPDATE SET
        role_client = EXCLUDED.role_client,
        est_principal = EXCLUDED.est_principal;

    RETURN jsonb_build_object(
        'associe', true,
        'code_dossier', v_dossier.code_dossier,
        'code_client', v_client.code_client,
        'role_client', CASE WHEN p_est_principal THEN 'Demandeur principal'
                            ELSE initcap(lower(trim(p_role_client))) END,
        'est_principal', p_est_principal
    );
END
$function$;

ALTER FUNCTION crm.associer_client_dossier(text, text, text, boolean)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.associer_client_dossier(text, text, text, boolean)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.associer_client_dossier(text, text, text, boolean)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.associer_client_dossier(text, text, text, boolean)
    TO crm_runtime;

CREATE OR REPLACE FUNCTION crm.obtenir_relation_dossier(p_code_dossier text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH cible AS MATERIALIZED (
        SELECT d.*, r.code_representant, r.nom_representant
        FROM public.dossiers_hypothecaires d
        JOIN public.representants r ON r.representant_id = d.representant_id
        WHERE d.code_dossier = upper(trim(p_code_dossier))
    )
    SELECT jsonb_build_object(
        'trouve', EXISTS (SELECT 1 FROM cible),
        'code_dossier', (SELECT c.code_dossier FROM cible c),
        'statut_dossier', (SELECT c.statut_dossier FROM cible c),
        'representant', COALESCE((
            SELECT jsonb_build_object(
                'code_representant', c.code_representant,
                'nom_representant', c.nom_representant
            ) FROM cible c
        ), '{}'::jsonb),
        'nombre_clients', (
            SELECT count(*) FROM cible c
            JOIN public.dossier_clients dc ON dc.dossier_id = c.dossier_id
        ),
        'clients', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'code_client', cl.code_client,
                'nom_client', cl.nom_client,
                'role_client', dc.role_client,
                'est_principal', dc.est_principal
            ) ORDER BY dc.est_principal DESC, cl.nom_client, cl.code_client)
            FROM cible c
            JOIN public.dossier_clients dc ON dc.dossier_id = c.dossier_id
            JOIN public.clients cl ON cl.client_id = dc.client_id
        ), '[]'::jsonb)
    );
$function$;

ALTER FUNCTION crm.obtenir_relation_dossier(text) OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_relation_dossier(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_relation_dossier(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_relation_dossier(text) TO crm_runtime;

DO $rename$
BEGIN
    IF to_regprocedure('crm.obtenir_dossier_hypothecaire_legacy(text)') IS NULL THEN
        ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
            RENAME TO obtenir_dossier_hypothecaire_legacy;
    END IF;
END
$rename$;

REVOKE EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire_legacy(text)
    FROM PUBLIC, crm_runtime;

CREATE OR REPLACE FUNCTION crm.obtenir_dossier_hypothecaire(p_reference_client text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH base AS MATERIALIZED (
        SELECT crm.obtenir_dossier_hypothecaire_legacy(p_reference_client) AS resultat
    ),
    client_cible AS MATERIALIZED (
        SELECT c.client_id
        FROM public.clients c
        CROSS JOIN base b
        WHERE c.code_client = b.resultat #>> '{dossier,code_client}'
    ),
    dossier_cible AS MATERIALIZED (
        SELECT d.code_dossier
        FROM client_cible cc
        JOIN public.dossier_clients dc ON dc.client_id = cc.client_id
        JOIN public.dossiers_hypothecaires d ON d.dossier_id = dc.dossier_id
        ORDER BY dc.est_principal DESC, d.updated_at DESC
        LIMIT 1
    ),
    relation AS MATERIALIZED (
        SELECT crm.obtenir_relation_dossier(d.code_dossier) AS objet
        FROM dossier_cible d
    )
    SELECT CASE
        WHEN b.resultat #>> '{dossier,code_client}' IS NULL THEN b.resultat
        ELSE jsonb_set(
            jsonb_set(
                b.resultat,
                '{dossier,code_dossier}',
                COALESCE(to_jsonb((SELECT d.code_dossier FROM dossier_cible d)), 'null'::jsonb),
                true
            ),
            '{dossier,relation_dossier}',
            COALESCE((SELECT r.objet FROM relation r), '{}'::jsonb),
            true
        )
    END
    FROM base b;
$function$;

ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.obtenir_dossier_hypothecaire(text)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
REVOKE EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.obtenir_dossier_hypothecaire(text) TO crm_runtime;

COMMENT ON TABLE public.dossiers_hypothecaires IS
    'Dossier hypothecaire appartenant a un representant et regroupant un ou plusieurs clients.';
COMMENT ON TABLE public.dossier_clients IS
    'Association securisee entre un dossier, ses clients et leur representant commun.';
