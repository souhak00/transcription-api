-- Agenda et rappels du représentant, reliés aux clients, dossiers et étapes métier.
-- Les fonctions crm.* constituent l'unique frontière accessible au compte d'exécution.

CREATE TABLE IF NOT EXISTS public.evenements_agenda (
    evenement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_evenement text NOT NULL UNIQUE DEFAULT (
        'EVT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    ),
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    client_id uuid,
    dossier_id uuid,
    etape_code text REFERENCES crm.etapes_parcours_hypothecaire(etape_code),
    type_evenement text NOT NULL DEFAULT 'rencontre' CHECK (
        type_evenement IN ('rencontre', 'appel', 'suivi', 'echeance', 'rappel', 'autre')
    ),
    titre text NOT NULL CHECK (char_length(trim(titre)) BETWEEN 1 AND 160),
    description text,
    debut_at timestamptz NOT NULL,
    fin_at timestamptz,
    fuseau_horaire text NOT NULL DEFAULT 'America/Toronto',
    emplacement text,
    lien_rencontre text,
    statut text NOT NULL DEFAULT 'planifie' CHECK (
        statut IN ('planifie', 'confirme', 'complete', 'annule')
    ),
    source text NOT NULL DEFAULT 'manuel' CHECK (
        source IN ('manuel', 'assistant', 'systeme', 'integration')
    ),
    request_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_evenement_periode CHECK (fin_at IS NULL OR fin_at > debut_at),
    CONSTRAINT uq_evenement_request UNIQUE (representant_id, request_id),
    CONSTRAINT fk_evenement_client_representant
        FOREIGN KEY (client_id, representant_id)
        REFERENCES public.clients(client_id, representant_id),
    CONSTRAINT fk_evenement_dossier_representant
        FOREIGN KEY (dossier_id, representant_id)
        REFERENCES public.dossiers_hypothecaires(dossier_id, representant_id)
);

DO $constraints$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_evenement_id_representant'
    ) THEN
        ALTER TABLE public.evenements_agenda
            ADD CONSTRAINT uq_evenement_id_representant
            UNIQUE (evenement_id, representant_id);
    END IF;
END
$constraints$;

CREATE TABLE IF NOT EXISTS public.rappels_evenement (
    rappel_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evenement_id uuid NOT NULL,
    representant_id uuid NOT NULL REFERENCES public.representants(representant_id),
    rappel_at timestamptz NOT NULL,
    canal text NOT NULL DEFAULT 'interface' CHECK (canal IN ('interface', 'courriel')),
    statut text NOT NULL DEFAULT 'a_envoyer' CHECK (
        statut IN ('a_envoyer', 'envoye', 'lu', 'annule', 'echec')
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_rappel_evenement_representant
        FOREIGN KEY (evenement_id, representant_id)
        REFERENCES public.evenements_agenda(evenement_id, representant_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_evenements_agenda_representant_debut
    ON public.evenements_agenda(representant_id, debut_at);
CREATE INDEX IF NOT EXISTS ix_evenements_agenda_client
    ON public.evenements_agenda(client_id, debut_at);
CREATE INDEX IF NOT EXISTS ix_rappels_evenement_a_envoyer
    ON public.rappels_evenement(representant_id, statut, rappel_at);

ALTER TABLE public.evenements_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evenements_agenda FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rappels_evenement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rappels_evenement FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evenements_agenda_access_policy ON public.evenements_agenda;
CREATE POLICY evenements_agenda_access_policy ON public.evenements_agenda
USING (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
)
WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
);

DROP POLICY IF EXISTS rappels_evenement_access_policy ON public.rappels_evenement;
CREATE POLICY rappels_evenement_access_policy ON public.rappels_evenement
USING (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
)
WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR (
        current_setting('app.role', true) = 'representant'
        AND representant_id::text = current_setting('app.representant_id', true)
    )
);

GRANT SELECT, INSERT, UPDATE ON public.evenements_agenda TO crm_service_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rappels_evenement TO crm_service_owner;

CREATE OR REPLACE FUNCTION crm.consulter_agenda(
    p_debut timestamptz,
    p_fin timestamptz,
    p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    WITH selection AS MATERIALIZED (
        SELECT
            e.*,
            c.code_client,
            c.nom_client,
            d.code_dossier,
            ep.titre AS etape_titre
        FROM public.evenements_agenda e
        LEFT JOIN public.clients c ON c.client_id = e.client_id
        LEFT JOIN public.dossiers_hypothecaires d ON d.dossier_id = e.dossier_id
        LEFT JOIN crm.etapes_parcours_hypothecaire ep ON ep.etape_code = e.etape_code
        WHERE (
              (
                  COALESCE((p_filters ->> 'rappels_seulement')::boolean, false) = false
                  AND e.debut_at < p_fin
                  AND COALESCE(e.fin_at, e.debut_at + interval '1 minute') >= p_debut
              )
              OR (
                  COALESCE((p_filters ->> 'rappels_seulement')::boolean, false) = true
                  AND (
                      (e.type_evenement = 'rappel' AND e.debut_at >= p_debut AND e.debut_at < p_fin)
                      OR EXISTS (
                          SELECT 1 FROM public.rappels_evenement r_period
                          WHERE r_period.evenement_id = e.evenement_id
                            AND r_period.rappel_at >= p_debut
                            AND r_period.rappel_at < p_fin
                      )
                  )
              )
          )
          AND (
              COALESCE(p_filters ->> 'type', '') = ''
              OR e.type_evenement = p_filters ->> 'type'
          )
          AND (
              COALESCE(p_filters ->> 'statut', '') = ''
              OR e.statut = p_filters ->> 'statut'
          )
          AND (
              COALESCE(p_filters ->> 'client_reference', '') = ''
              OR c.code_client = upper(p_filters ->> 'client_reference')
              OR lower(c.nom_client) LIKE '%' || lower(p_filters ->> 'client_reference') || '%'
          )
          AND (
              COALESCE((p_filters ->> 'rappels_seulement')::boolean, false) = false
              OR e.type_evenement = 'rappel'
              OR EXISTS (
                  SELECT 1 FROM public.rappels_evenement r
                  WHERE r.evenement_id = e.evenement_id
                    AND r.statut IN ('a_envoyer', 'envoye')
              )
          )
          AND (
              COALESCE((p_filters ->> 'en_retard')::boolean, false) = false
              OR EXISTS (
                  SELECT 1 FROM public.rappels_evenement r_overdue
                  WHERE r_overdue.evenement_id = e.evenement_id
                    AND r_overdue.statut = 'a_envoyer'
                    AND r_overdue.rappel_at < now()
              )
          )
    )
    SELECT jsonb_build_object(
        'debut', p_debut,
        'fin', p_fin,
        'fuseau_horaire', 'America/Toronto',
        'nombre_evenements', count(*),
        'evenements', COALESCE(jsonb_agg(
            jsonb_build_object(
                'code_evenement', s.code_evenement,
                'type', s.type_evenement,
                'titre', s.titre,
                'description', s.description,
                'debut', s.debut_at,
                'fin', s.fin_at,
                'fuseau_horaire', s.fuseau_horaire,
                'emplacement', s.emplacement,
                'lien_rencontre', s.lien_rencontre,
                'statut', s.statut,
                'source', s.source,
                'code_client', s.code_client,
                'nom_client', s.nom_client,
                'code_dossier', s.code_dossier,
                'etape_code', s.etape_code,
                'etape_titre', s.etape_titre,
                'rappels', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'date', r.rappel_at,
                        'canal', r.canal,
                        'statut', r.statut
                    ) ORDER BY r.rappel_at)
                    FROM public.rappels_evenement r
                    WHERE r.evenement_id = s.evenement_id
                ), '[]'::jsonb)
            ) ORDER BY s.debut_at, s.code_evenement
        ) FILTER (WHERE s.evenement_id IS NOT NULL), '[]'::jsonb)
    )
    FROM selection s;
$function$;

CREATE OR REPLACE FUNCTION crm.creer_evenement_agenda(
    p_payload jsonb,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_representant_id uuid;
    v_client_id uuid;
    v_dossier_id uuid;
    v_evenement_id uuid;
    v_code_evenement text;
    v_debut timestamptz;
    v_fin timestamptz;
    v_reference text;
    v_client_matches integer;
    v_rappel jsonb;
BEGIN
    v_representant_id := NULLIF(current_setting('app.representant_id', true), '')::uuid;
    IF current_setting('app.role', true) <> 'representant' OR v_representant_id IS NULL THEN
        RAISE EXCEPTION 'Contexte représentant requis';
    END IF;

    IF NULLIF(trim(p_payload ->> 'titre'), '') IS NULL THEN
        RAISE EXCEPTION 'Le titre est requis';
    END IF;
    v_debut := NULLIF(p_payload ->> 'debut', '')::timestamptz;
    v_fin := NULLIF(p_payload ->> 'fin', '')::timestamptz;
    IF v_debut IS NULL OR (v_fin IS NOT NULL AND v_fin <= v_debut) THEN
        RAISE EXCEPTION 'La période est invalide';
    END IF;

    v_reference := NULLIF(trim(p_payload ->> 'client_reference'), '');
    IF v_reference IS NOT NULL THEN
        SELECT count(*) INTO v_client_matches
        FROM public.clients c
        WHERE c.code_client = upper(v_reference)
           OR lower(c.nom_client) = lower(v_reference);
        IF v_client_matches = 0 THEN
            RAISE EXCEPTION 'Client introuvable ou non autorisé';
        ELSIF v_client_matches > 1 THEN
            RAISE EXCEPTION 'Plusieurs clients correspondent; utilisez le code client';
        END IF;
        SELECT c.client_id INTO v_client_id
        FROM public.clients c
        WHERE c.code_client = upper(v_reference)
           OR lower(c.nom_client) = lower(v_reference)
        ORDER BY CASE WHEN c.code_client = upper(v_reference) THEN 0 ELSE 1 END
        LIMIT 1;
        IF v_client_id IS NULL THEN
            RAISE EXCEPTION 'Client introuvable ou non autorisé';
        END IF;
        SELECT dc.dossier_id INTO v_dossier_id
        FROM public.dossier_clients dc
        WHERE dc.client_id = v_client_id
        ORDER BY dc.est_principal DESC, dc.created_at
        LIMIT 1;
    END IF;

    SELECT e.evenement_id, e.code_evenement
      INTO v_evenement_id, v_code_evenement
    FROM public.evenements_agenda e
    WHERE e.representant_id = v_representant_id
      AND e.request_id = p_request_id;

    IF v_evenement_id IS NULL THEN
        INSERT INTO public.evenements_agenda (
            representant_id, client_id, dossier_id, etape_code, type_evenement,
            titre, description, debut_at, fin_at, fuseau_horaire, emplacement,
            lien_rencontre, statut, source, request_id
        ) VALUES (
            v_representant_id,
            v_client_id,
            v_dossier_id,
            NULLIF(p_payload ->> 'etape_code', ''),
            COALESCE(NULLIF(p_payload ->> 'type', ''), 'rencontre'),
            trim(p_payload ->> 'titre'),
            NULLIF(trim(p_payload ->> 'description'), ''),
            v_debut,
            v_fin,
            COALESCE(NULLIF(p_payload ->> 'fuseau_horaire', ''), 'America/Toronto'),
            NULLIF(trim(p_payload ->> 'emplacement'), ''),
            NULLIF(trim(p_payload ->> 'lien_rencontre'), ''),
            COALESCE(NULLIF(p_payload ->> 'statut', ''), 'planifie'),
            COALESCE(NULLIF(p_payload ->> 'source', ''), 'manuel'),
            p_request_id
        ) RETURNING evenement_id, code_evenement INTO v_evenement_id, v_code_evenement;

        FOR v_rappel IN
            SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'rappels', '[]'::jsonb))
        LOOP
            INSERT INTO public.rappels_evenement (
                evenement_id, representant_id, rappel_at, canal
            ) VALUES (
                v_evenement_id,
                v_representant_id,
                COALESCE(
                    NULLIF(v_rappel ->> 'date', '')::timestamptz,
                    v_debut - make_interval(mins => COALESCE((v_rappel ->> 'minutes_avant')::integer, 30))
                ),
                COALESCE(NULLIF(v_rappel ->> 'canal', ''), 'interface')
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'code_evenement', v_code_evenement,
        'statut', 'cree',
        'request_id', p_request_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION crm.modifier_evenement_agenda(
    p_code_evenement text,
    p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_representant_id uuid;
    v_client_id uuid;
    v_dossier_id uuid;
    v_evenement_id uuid;
    v_debut timestamptz;
    v_fin timestamptz;
    v_reference text;
    v_client_matches integer;
    v_rappel jsonb;
BEGIN
    v_representant_id := NULLIF(current_setting('app.representant_id', true), '')::uuid;
    IF current_setting('app.role', true) <> 'representant' OR v_representant_id IS NULL THEN
        RAISE EXCEPTION 'Contexte représentant requis';
    END IF;

    SELECT e.evenement_id INTO v_evenement_id
    FROM public.evenements_agenda e
    WHERE e.code_evenement = upper(trim(p_code_evenement))
      AND e.representant_id = v_representant_id;
    IF v_evenement_id IS NULL THEN
        RAISE EXCEPTION 'Événement introuvable ou non autorisé';
    END IF;

    IF NULLIF(trim(p_payload ->> 'titre'), '') IS NULL THEN
        RAISE EXCEPTION 'Le titre est requis';
    END IF;
    v_debut := NULLIF(p_payload ->> 'debut', '')::timestamptz;
    v_fin := NULLIF(p_payload ->> 'fin', '')::timestamptz;
    IF v_debut IS NULL OR (v_fin IS NOT NULL AND v_fin <= v_debut) THEN
        RAISE EXCEPTION 'La période est invalide';
    END IF;

    v_reference := NULLIF(trim(p_payload ->> 'client_reference'), '');
    IF v_reference IS NOT NULL THEN
        SELECT count(*) INTO v_client_matches
        FROM public.clients c
        WHERE c.code_client = upper(v_reference)
           OR lower(c.nom_client) = lower(v_reference);
        IF v_client_matches = 0 THEN
            RAISE EXCEPTION 'Client introuvable ou non autorisé';
        ELSIF v_client_matches > 1 THEN
            RAISE EXCEPTION 'Plusieurs clients correspondent; utilisez le code client';
        END IF;
        SELECT c.client_id INTO v_client_id
        FROM public.clients c
        WHERE c.code_client = upper(v_reference)
           OR lower(c.nom_client) = lower(v_reference)
        ORDER BY CASE WHEN c.code_client = upper(v_reference) THEN 0 ELSE 1 END
        LIMIT 1;
        SELECT dc.dossier_id INTO v_dossier_id
        FROM public.dossier_clients dc
        WHERE dc.client_id = v_client_id
        ORDER BY dc.est_principal DESC, dc.created_at
        LIMIT 1;
    END IF;

    UPDATE public.evenements_agenda
    SET client_id = v_client_id,
        dossier_id = v_dossier_id,
        etape_code = NULLIF(p_payload ->> 'etape_code', ''),
        type_evenement = COALESCE(NULLIF(p_payload ->> 'type', ''), 'rencontre'),
        titre = trim(p_payload ->> 'titre'),
        description = NULLIF(trim(p_payload ->> 'description'), ''),
        debut_at = v_debut,
        fin_at = v_fin,
        fuseau_horaire = COALESCE(NULLIF(p_payload ->> 'fuseau_horaire', ''), 'America/Toronto'),
        emplacement = NULLIF(trim(p_payload ->> 'emplacement'), ''),
        lien_rencontre = NULLIF(trim(p_payload ->> 'lien_rencontre'), ''),
        statut = COALESCE(NULLIF(p_payload ->> 'statut', ''), 'planifie'),
        updated_at = now()
    WHERE evenement_id = v_evenement_id
      AND representant_id = v_representant_id;

    DELETE FROM public.rappels_evenement
    WHERE evenement_id = v_evenement_id
      AND representant_id = v_representant_id;
    FOR v_rappel IN
        SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'rappels', '[]'::jsonb))
    LOOP
        INSERT INTO public.rappels_evenement (
            evenement_id, representant_id, rappel_at, canal
        ) VALUES (
            v_evenement_id,
            v_representant_id,
            COALESCE(
                NULLIF(v_rappel ->> 'date', '')::timestamptz,
                v_debut - make_interval(mins => COALESCE((v_rappel ->> 'minutes_avant')::integer, 30))
            ),
            COALESCE(NULLIF(v_rappel ->> 'canal', ''), 'interface')
        );
    END LOOP;

    RETURN jsonb_build_object(
        'code_evenement', upper(trim(p_code_evenement)),
        'statut', 'modifie'
    );
END;
$function$;

ALTER FUNCTION crm.consulter_agenda(timestamptz, timestamptz, jsonb)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.consulter_agenda(timestamptz, timestamptz, jsonb)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.creer_evenement_agenda(jsonb, uuid)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.creer_evenement_agenda(jsonb, uuid)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;
ALTER FUNCTION crm.modifier_evenement_agenda(text, jsonb)
    OWNER TO crm_service_owner;
ALTER FUNCTION crm.modifier_evenement_agenda(text, jsonb)
    SECURITY DEFINER SET search_path = pg_catalog, crm, public;

REVOKE EXECUTE ON FUNCTION crm.consulter_agenda(timestamptz, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION crm.creer_evenement_agenda(jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION crm.modifier_evenement_agenda(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.consulter_agenda(timestamptz, timestamptz, jsonb) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.creer_evenement_agenda(jsonb, uuid) TO crm_runtime;
GRANT EXECUTE ON FUNCTION crm.modifier_evenement_agenda(text, jsonb) TO crm_runtime;

COMMENT ON TABLE public.evenements_agenda IS
    'Rencontres, suivis, échéances et rappels isolés par représentant avec RLS.';
COMMENT ON FUNCTION crm.consulter_agenda(timestamptz, timestamptz, jsonb) IS
    'Retourne les événements visibles, sans exposer les identifiants techniques.';
