-- Suit la durée du statut courant sans la réinitialiser lors d'une autre modification.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS statut_depuis timestamptz;
UPDATE public.clients
SET statut_depuis = COALESCE(statut_depuis, updated_at, created_at, now())
WHERE statut_depuis IS NULL;
ALTER TABLE public.clients ALTER COLUMN statut_depuis SET DEFAULT now();
ALTER TABLE public.clients ALTER COLUMN statut_depuis SET NOT NULL;

CREATE OR REPLACE FUNCTION crm.maintenir_statut_depuis()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.statut_depuis := COALESCE(NEW.statut_depuis, now());
    ELSIF NEW.statut_dossier IS DISTINCT FROM OLD.statut_dossier THEN
        NEW.statut_depuis := now();
    ELSE
        NEW.statut_depuis := OLD.statut_depuis;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clients_statut_depuis ON public.clients;
CREATE TRIGGER trg_clients_statut_depuis
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION crm.maintenir_statut_depuis();

COMMENT ON COLUMN public.clients.statut_depuis IS
    'Début du statut courant; ne change que lorsque statut_dossier change.';
