-- Compte et portefeuille synthetiques pour le beta-testeur Tommy Bertrand.
-- Idempotent : le code representant et les courriels example.test sont stables.

BEGIN;

SELECT set_config('app.role', 'admin', true);

INSERT INTO public.app_users (courriel, role, actif)
VALUES ('info@tommybertrand.com', 'representant', true)
ON CONFLICT (courriel) DO UPDATE SET
    role = EXCLUDED.role,
    actif = true,
    updated_at = now();

INSERT INTO public.representants (
    code_representant, nom_representant, courriel, equipe, actif, user_id
)
SELECT
    '2026999997', 'Tommy Bertrand - Beta', 'info@tommybertrand.com',
    'Beta', true, u.user_id
FROM public.app_users u
WHERE lower(u.courriel) = 'info@tommybertrand.com'
ON CONFLICT (code_representant) DO UPDATE SET
    nom_representant = EXCLUDED.nom_representant,
    courriel = EXCLUDED.courriel,
    equipe = EXCLUDED.equipe,
    actif = true,
    user_id = EXCLUDED.user_id,
    updated_at = now();

CREATE TEMPORARY TABLE tommy_beta_scenarios (
    numero integer PRIMARY KEY,
    prenom text NOT NULL,
    nom text NOT NULL,
    statut text NOT NULL,
    transaction text NOT NULL,
    emploi text,
    revenu numeric,
    valeur numeric,
    financement numeric,
    objectif text NOT NULL,
    preteur text,
    approbation text,
    taux numeric,
    fermeture_jours integer
) ON COMMIT DROP;

INSERT INTO tommy_beta_scenarios VALUES
  (1, 'Camille', 'Mercier', 'Nouveau', 'Premier achat', 'Salariee', 68000, 390000, 370500,
   'Valider la capacite d emprunt et la mise de fonds', NULL, 'Non soumis', NULL, 90),
  (2, 'Alexandre', 'Gauthier', 'Documents requis', 'Achat', 'Travailleur autonome', 124000, 625000, 500000,
   'Qualifier les revenus autonomes sur deux exercices', NULL, 'Documents incomplets', NULL, 75),
  (3, 'Mireille', 'Boucher', 'En analyse', 'Refinancement', 'Salariee', 91000, 610000, 410000,
   'Consolider les dettes et financer des renovations', 'Desjardins', 'Analyse de credit', 4.8900, 60),
  (4, 'Jean', 'Leblanc', 'Preapprouve', 'Achat', 'Salarie', 108000, 575000, 460000,
   'Comparer une preapprobation fixe et variable', 'Banque Nationale', 'Preapprouve', 4.7400, 80),
  (5, 'Nadia', 'Roy', 'Conditions', 'Achat assure', 'Salariee', 79000, 485000, 460750,
   'Lever la condition de confirmation d emploi', 'RBC', 'Approuve avec conditions', 4.9400, 35),
  (6, 'Frederic', 'Morin', 'Approuve', 'Renouvellement', 'Salarie', 97000, 520000, 296000,
   'Comparer le renouvellement avec un transfert de preteur', 'BMO', 'Approuve', 4.4900, 45),
  (7, 'Sarah', 'Nguyen', 'Pret a fermer', 'Achat condo', 'Professionnelle', 139000, 735000, 551250,
   'Finaliser le notaire et l assurance avant la fermeture', 'TD', 'Final', 4.5900, 8),
  (8, 'Olivier', 'Caron', 'Refuse', 'Achat', 'Salarie', 59000, 510000, 484500,
   'Revoir le budget apres un refus pour ratios eleves', 'CIBC', 'Refuse - ratios', 5.1900, NULL),
  (9, 'Lea', 'Fortin', 'En analyse', 'Achat locatif', 'Travailleur autonome', 146000, 890000, 712000,
   'Analyser les revenus locatifs d un duplex', 'First National', 'Analyse de credit', 5.0900, 55),
  (10, 'Gabriel', 'Tremblay', 'Documents requis', 'Rachat de part', 'Salarie', 102000, 645000, 372000,
   'Documenter le rachat de part apres separation', 'Desjardins', 'Documents incomplets', 4.9900, 40);

INSERT INTO public.clients (
    representant_id, nom_client, prenom, nom, telephone, courriel,
    type_emploi, revenu_annuel, type_transaction, valeur_propriete,
    montant_financement, objectif, date_rappel, statut_dossier,
    niveau_confiance, resume
)
SELECT
    r.representant_id,
    concat_ws(' ', s.prenom, s.nom), s.prenom, s.nom,
    format('514-720-%s', lpad(s.numero::text, 4, '0')),
    format('tommy.beta%s@example.test', lpad(s.numero::text, 2, '0')),
    s.emploi, s.revenu, s.transaction, s.valeur, s.financement,
    s.objectif, current_date + CASE WHEN s.numero IN (2, 3, 10) THEN -2 ELSE s.numero END,
    s.statut, 'Donnees synthetiques beta',
    format('Scenario beta %s - %s', s.numero, s.objectif)
FROM tommy_beta_scenarios s
CROSS JOIN public.representants r
WHERE r.code_representant = '2026999997'
ON CONFLICT (representant_id, lower(courriel)) WHERE courriel IS NOT NULL AND btrim(courriel) <> ''
DO UPDATE SET
    nom_client = EXCLUDED.nom_client,
    prenom = EXCLUDED.prenom,
    nom = EXCLUDED.nom,
    telephone = EXCLUDED.telephone,
    type_emploi = EXCLUDED.type_emploi,
    revenu_annuel = EXCLUDED.revenu_annuel,
    type_transaction = EXCLUDED.type_transaction,
    valeur_propriete = EXCLUDED.valeur_propriete,
    montant_financement = EXCLUDED.montant_financement,
    objectif = EXCLUDED.objectif,
    date_rappel = EXCLUDED.date_rappel,
    statut_dossier = EXCLUDED.statut_dossier,
    niveau_confiance = EXCLUDED.niveau_confiance,
    resume = EXCLUDED.resume,
    updated_at = now();

UPDATE public.dossiers_hypothecaires d SET
    statut_dossier = c.statut_dossier,
    type_transaction = c.type_transaction,
    objectif = c.objectif,
    updated_at = now()
FROM public.dossier_clients dc
JOIN public.clients c ON c.client_id = dc.client_id AND dc.est_principal
WHERE d.dossier_id = dc.dossier_id
  AND c.representant_id = (SELECT representant_id FROM public.representants WHERE code_representant = '2026999997');

INSERT INTO public.details_hypothecaires (
    client_id, representant_id, preteur, produit, statut_approbation,
    taux_interet, type_taux, terme_mois, amortissement_annees,
    date_fermeture, evaluation_requise, evaluation_statut,
    assurance_requise, assurance_statut
)
SELECT
    c.client_id, c.representant_id, s.preteur, s.transaction,
    s.approbation, s.taux, CASE WHEN s.numero IN (4, 6) THEN 'Variable' ELSE 'Fixe' END,
    60, 25,
    CASE WHEN s.fermeture_jours IS NULL THEN NULL ELSE current_date + s.fermeture_jours END,
    s.numero IN (3, 5, 7, 9, 10),
    CASE WHEN s.numero = 7 THEN 'Completee' WHEN s.numero IN (3, 5, 9, 10) THEN 'A planifier' ELSE 'Non requise' END,
    s.numero IN (1, 5),
    CASE WHEN s.numero = 5 THEN 'En analyse' WHEN s.numero = 1 THEN 'A confirmer' ELSE 'Non requise' END
FROM tommy_beta_scenarios s
JOIN public.clients c ON lower(c.courriel) = lower(format('tommy.beta%s@example.test', lpad(s.numero::text, 2, '0')))
ON CONFLICT (client_id) DO UPDATE SET
    preteur = EXCLUDED.preteur,
    produit = EXCLUDED.produit,
    statut_approbation = EXCLUDED.statut_approbation,
    taux_interet = EXCLUDED.taux_interet,
    type_taux = EXCLUDED.type_taux,
    date_fermeture = EXCLUDED.date_fermeture,
    evaluation_requise = EXCLUDED.evaluation_requise,
    evaluation_statut = EXCLUDED.evaluation_statut,
    assurance_requise = EXCLUDED.assurance_requise,
    assurance_statut = EXCLUDED.assurance_statut,
    updated_at = now();

INSERT INTO public.documents_requis (client_id, representant_id, document, statut, date_demande)
SELECT c.client_id, c.representant_id, v.document, v.statut, current_date - 3
FROM (VALUES
    (2, 'Avis de cotisation - 2 ans', 'A recevoir'),
    (2, 'Etats financiers entreprise', 'En attente'),
    (3, 'Preuve des dettes a consolider', 'A recevoir'),
    (5, 'Confirmation d emploi', 'A recevoir'),
    (7, 'Preuve assurance habitation', 'A recevoir'),
    (9, 'Baux locatifs', 'A recevoir'),
    (10, 'Convention de separation', 'A recevoir')
) v(numero, document, statut)
JOIN public.clients c ON lower(c.courriel) = lower(format('tommy.beta%s@example.test', lpad(v.numero::text, 2, '0')))
WHERE NOT EXISTS (
    SELECT 1 FROM public.documents_requis d
    WHERE d.client_id = c.client_id AND lower(d.document) = lower(v.document)
);

INSERT INTO public.taches (client_id, representant_id, titre, description, date_echeance, statut)
SELECT c.client_id, c.representant_id, v.titre, v.description,
       current_date + v.echeance_jours, 'Ouverte'
FROM (VALUES
    (1, 'Appel de decouverte', 'Valider le budget et les criteres', 1),
    (2, 'Relancer documents autonomes', 'Obtenir les documents fiscaux', -2),
    (3, 'Verifier les dettes', 'Confirmer les soldes a consolider', -1),
    (5, 'Lever la condition d emploi', 'Transmettre la confirmation au preteur', 2),
    (7, 'Confirmer le notaire', 'Valider les instructions avant fermeture', 1),
    (8, 'Revoir la strategie', 'Proposer un budget compatible avec les ratios', 7),
    (10, 'Obtenir la convention', 'Valider le montant du rachat de part', -3)
) v(numero, titre, description, echeance_jours)
JOIN public.clients c ON lower(c.courriel) = lower(format('tommy.beta%s@example.test', lpad(v.numero::text, 2, '0')))
WHERE NOT EXISTS (
    SELECT 1 FROM public.taches t
    WHERE t.client_id = c.client_id AND lower(t.titre) = lower(v.titre)
);

DO $verification$
DECLARE
    v_representant uuid;
    v_clients integer;
    v_dossiers integer;
BEGIN
    SELECT representant_id INTO v_representant
    FROM public.representants WHERE code_representant = '2026999997';

    SELECT count(*) INTO v_clients FROM public.clients
    WHERE representant_id = v_representant
      AND courriel LIKE 'tommy.beta%@example.test';
    SELECT count(*) INTO v_dossiers FROM public.dossiers_hypothecaires
    WHERE representant_id = v_representant;

    IF v_clients <> 10 OR v_dossiers < 10 THEN
        RAISE EXCEPTION 'Jeu beta incomplet: clients=%, dossiers=%', v_clients, v_dossiers;
    END IF;
END
$verification$;

COMMIT;
