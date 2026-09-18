-- Valide le service spécialisé sous le rôle d'exécution restreint.

BEGIN;
SET LOCAL ROLE crm_runtime;

DO $test$
DECLARE
    v_resultat jsonb;
BEGIN
    PERFORM set_config('app.role', 'representant', true);
    PERFORM set_config(
        'app.representant_id',
        'ac7b7a4b-907e-4733-a0de-4e5ed40e6af0',
        true
    );
    v_resultat := crm.obtenir_dossier_hypothecaire('Benoît Tremblay');

    IF v_resultat #>> '{dossier,details_hypothecaires,taux_interet}'
        IS DISTINCT FROM '4.7900' THEN
        RAISE EXCEPTION 'Le taux retourné est inattendu: %', v_resultat;
    END IF;

    IF v_resultat::text ~ 'detail_id|client_id|representant_id' THEN
        RAISE EXCEPTION 'Un identifiant technique a été exposé: %', v_resultat;
    END IF;
END
$test$;

ROLLBACK;
