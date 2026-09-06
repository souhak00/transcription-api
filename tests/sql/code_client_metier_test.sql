-- Test transactionnel du format, de l unicite et de l immutabilite de code_client.

BEGIN;

DO $test$
DECLARE
    v_representant_id uuid;
    v_client_id uuid;
    v_code_client text;
    v_modification_bloquee boolean := false;
BEGIN
    IF crm.calculer_initiales_client('Olivier Bergeron') IS DISTINCT FROM 'OB' THEN
        RAISE EXCEPTION 'Initiales inattendues pour Olivier Bergeron';
    END IF;

    IF crm.calculer_initiales_client('Tremblay, Guylaine') IS DISTINCT FROM 'GT' THEN
        RAISE EXCEPTION 'Initiales inattendues pour Tremblay, Guylaine';
    END IF;

    INSERT INTO public.representants (
        code_representant,
        nom_representant,
        courriel
    )
    VALUES (
        '2026999995',
        'Representant Code Client',
        'code-client@example.test'
    )
    RETURNING representant_id INTO v_representant_id;

    INSERT INTO public.clients (
        representant_id,
        nom_client,
        courriel,
        created_at
    )
    VALUES (
        v_representant_id,
        'Olivier Bergeron',
        'olivier-code-client@example.test',
        timestamptz '2026-08-09 12:00:00-04'
    )
    RETURNING client_id, code_client INTO v_client_id, v_code_client;

    IF v_code_client !~ '^CLI-2026-OB-[0-9]{6}$' THEN
        RAISE EXCEPTION 'Format code_client inattendu: %', v_code_client;
    END IF;

    BEGIN
        UPDATE public.clients
        SET code_client = 'CLI-2026-OB-999999'
        WHERE client_id = v_client_id;
    EXCEPTION
        WHEN raise_exception THEN
            v_modification_bloquee := true;
    END;

    IF NOT v_modification_bloquee THEN
        RAISE EXCEPTION 'code_client devrait etre immuable';
    END IF;
END
$test$;

ROLLBACK;
