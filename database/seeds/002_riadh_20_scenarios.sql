-- Jeu de demonstration synthetique pour representant-riadh@example.test.
-- Idempotent : les courriels example.test identifient les 20 scenarios.

BEGIN;

DO $preconditions$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.representants
        WHERE code_representant = '2026999998' AND actif
    ) THEN
        RAISE EXCEPTION 'Le representant Riadh (2026999998) est introuvable.';
    END IF;
END
$preconditions$;

SELECT set_config('app.role', 'representant', true);
SELECT set_config(
    'app.representant_id',
    (SELECT representant_id::text FROM public.representants
     WHERE code_representant = '2026999998'),
    true
);

CREATE TEMPORARY TABLE riadh_scenarios (
    numero integer PRIMARY KEY,
    prenom text NOT NULL,
    nom text NOT NULL,
    telephone text NOT NULL,
    courriel text NOT NULL,
    statut text NOT NULL,
    type_transaction text NOT NULL,
    type_emploi text,
    employeur text,
    revenu_annuel numeric,
    prix_achat numeric,
    valeur_propriete numeric,
    solde_hypothecaire numeric,
    montant_financement numeric,
    mise_de_fonds numeric,
    objectif text,
    rappel_jours integer,
    preteur text,
    produit text,
    statut_approbation text,
    taux numeric,
    type_taux text,
    terme_mois integer,
    fermeture_jours integer,
    evaluation_requise boolean,
    evaluation_statut text,
    assurance_requise boolean,
    assurance_statut text
) ON COMMIT DROP;

INSERT INTO riadh_scenarios VALUES
  (1, 'Alice', 'Gagnon', '514-700-2001', 'riadh.scenario01@example.test',
   'Nouveau', 'Premier achat', 'Salariee', 'Clinique du Centre', 72000,
   425000, 425000, NULL, 403750, 21250,
   'Premier achat avec mise de fonds minimale', 2,
   NULL, NULL, 'Non soumis', NULL, NULL, NULL, 75, true, 'A planifier', true, 'A confirmer'),
  (2, 'Marc', 'Beaulieu', '514-700-2002', 'riadh.scenario02@example.test',
   'Prequalification', 'Achat', 'Travailleur autonome', 'Beaulieu Design inc.', 118000,
   650000, 650000, NULL, 520000, 130000,
   'Qualification avec revenus autonomes', -2,
   NULL, NULL, 'Prequalification', NULL, NULL, NULL, 90, true, 'Non commandee', false, NULL),
  (3, 'Sophie', 'Cote', '514-700-2003', 'riadh.scenario03@example.test',
   'Documents requis', 'Refinancement', 'Salariee', 'Ville de Montreal', 89000,
   NULL, 610000, 285000, 390000, NULL,
   'Consolider des dettes et renover la cuisine', -5,
   NULL, NULL, 'En attente des documents', NULL, NULL, NULL, 60, true, 'A planifier', false, NULL),
  (4, 'Karim', 'Haddad', '514-700-2004', 'riadh.scenario04@example.test',
   'En analyse', 'Achat condo', 'Salarie', 'NordTech', 105000,
   575000, 575000, NULL, 460000, 115000,
   'Achat d un condo au centre-ville', 1,
   'Banque Nationale', 'Conventionnel', 'Analyse de credit', 4.89, 'Fixe', 60, 50, true, 'Planifiee', false, NULL),
  (5, 'Julie', 'Fortin', '514-700-2005', 'riadh.scenario05@example.test',
   'Preapprouve', 'Achat', 'Salariee', 'Hydro-Quebec', 96000,
   540000, 540000, NULL, 432000, 108000,
   'Preapprobation pour maison unifamiliale', 7,
   'Desjardins', 'Preapprobation 120 jours', 'Preapprouve', 4.74, 'Fixe', 60, 80, false, 'Non requise', false, NULL),
  (6, 'Nicolas', 'Roy', '514-700-2006', 'riadh.scenario06@example.test',
   'Conditions', 'Achat', 'Salarie', 'Solutions Alpha', 84000,
   495000, 495000, NULL, 445500, 49500,
   'Approbation conditionnelle a la confirmation d emploi', 0,
   'RBC', 'Assure SCHL', 'Approuve avec conditions', 4.94, 'Fixe', 60, 35, true, 'Completee', true, 'Soumission en cours'),
  (7, 'Emma', 'Tremblay', '514-700-2007', 'riadh.scenario07@example.test',
   'Approuve', 'Achat', 'Professionnelle', 'Cabinet Tremblay', 145000,
   780000, 780000, NULL, 585000, 195000,
   'Achat avec mise de fonds de 25 pour cent', 5,
   'Banque Scotia', 'Conventionnel', 'Approuve', 4.59, 'Fixe', 36, 28, true, 'Completee', false, 'Non requise'),
  (8, 'David', 'Nguyen', '514-700-2008', 'riadh.scenario08@example.test',
   'Pret a fermer', 'Achat', 'Salarie', 'Aero Montreal', 112000,
   690000, 690000, NULL, 552000, 138000,
   'Finaliser avant la date de prise de possession', -1,
   'TD', 'Conventionnel', 'Final', 4.69, 'Fixe', 60, 14, true, 'Acceptee', false, 'Preuve recue'),
  (9, 'Chloe', 'Martin', '514-700-2009', 'riadh.scenario09@example.test',
   'Ferme', 'Renouvellement', 'Salariee', 'Universite de Montreal', 101000,
   NULL, 525000, 318000, 318000, NULL,
   'Renouvellement complete avec nouveau preteur', 30,
   'BMO', 'Transfert', 'Decaisse', 4.49, 'Fixe', 36, -12, false, 'Non requise', false, 'Non requise'),
  (10, 'Samuel', 'Bouchard', '514-700-2010', 'riadh.scenario10@example.test',
   'Refuse', 'Achat', 'Salarie', 'Distribution Est', 61000,
   515000, 515000, NULL, 489250, 25750,
   'Revoir le budget apres refus pour ratios eleves', 14,
   'Desjardins', 'Assure', 'Refuse - ratios', 5.19, 'Fixe', 60, NULL, false, 'Non commandee', true, 'Non soumis'),
  (11, 'Isabelle', 'Pelletier', '514-700-2011', 'riadh.scenario11@example.test',
   'En analyse', 'Renouvellement', 'Salariee', 'Assurances Quebec', 93000,
   NULL, 480000, 276000, 276000, NULL,
   'Comparer taux fixe et variable avant renouvellement', 3,
   'MCAP', 'Renouvellement', 'Tarification', 4.45, 'Variable', 60, 45, false, 'Non requise', false, NULL),
  (12, 'Thomas', 'Girard', '514-700-2012', 'riadh.scenario12@example.test',
   'Documents requis', 'Refinancement locatif', 'Travailleur autonome', 'Gestion TG', 132000,
   NULL, 850000, 410000, 560000, NULL,
   'Refinancer un immeuble locatif et retirer des liquidites', -4,
   'First National', 'Locatif', 'Documents incomplets', 5.09, 'Fixe', 60, 70, true, 'Non commandee', false, NULL),
  (13, 'Lea', 'Morin', '514-700-2013', 'riadh.scenario13@example.test',
   'Prequalification', 'Construction', 'Salariee', 'Groupe Construction LM', 108000,
   720000, 720000, NULL, 576000, 144000,
   'Autoconstruction avec debourses progressifs', 6,
   'Banque Laurentienne', 'Autoconstruction', 'Etude preliminaire', 5.29, 'Variable', 12, 150, true, 'Plans requis', false, NULL),
  (14, 'Olivier', 'Caron', '514-700-2014', 'riadh.scenario14@example.test',
   'En analyse', 'Achat investissement', 'Salarie', 'Telecom Canada', 127000,
   925000, 925000, NULL, 740000, 185000,
   'Acquisition d un duplex locatif', -1,
   'CIBC', 'Immeuble locatif', 'Analyse de credit', 5.14, 'Fixe', 60, 55, true, 'Commandee', false, NULL),
  (15, 'Fatima', 'Zahra', '514-700-2015', 'riadh.scenario15@example.test',
   'Documents requis', 'Premier achat', 'Salariee', 'Sante Plus', 78000,
   465000, 465000, NULL, 441750, 23250,
   'Premier achat pour nouvelle arrivante', 1,
   NULL, 'Nouveaux arrivants', 'Validation du permis', NULL, NULL, NULL, 95, true, 'A planifier', true, 'A confirmer'),
  (16, 'Antoine', 'Lavoie', '514-700-2016', 'riadh.scenario16@example.test',
   'En analyse', 'Achat', 'Commissions', 'Ventes Performance', 156000,
   810000, 810000, NULL, 648000, 162000,
   'Qualification avec revenu variable et commissions', -3,
   'RBC', 'Conventionnel', 'Validation des revenus', 4.84, 'Fixe', 60, 65, true, 'A planifier', false, NULL),
  (17, 'Melanie', 'Simard', '514-700-2017', 'riadh.scenario17@example.test',
   'Conditions', 'Rachat de part', 'Salariee', 'Services Juridiques MS', 99000,
   NULL, 640000, 295000, 365000, NULL,
   'Rachat de la part du conjoint apres separation', 2,
   'Desjardins', 'Refinancement', 'Conditionnel', 4.99, 'Fixe', 60, 40, true, 'Completee', false, NULL),
  (18, 'Vincent', 'Bernier', '514-700-2018', 'riadh.scenario18@example.test',
   'Preapprouve', 'Financement relais', 'Salarie', 'Ingenierie VB', 138000,
   875000, 875000, 340000, 700000, 175000,
   'Coordonner vente actuelle et achat de la nouvelle propriete', 4,
   'BMO', 'Pret relais', 'Preapprouve', 5.34, 'Variable', 6, 32, true, 'A commander', false, NULL),
  (19, 'Nadia', 'El Amrani', '514-700-2019', 'riadh.scenario19@example.test',
   'Approuve', 'Achat assure', 'Salariee', 'Pharma Quebec', 87000,
   510000, 510000, NULL, 484500, 25500,
   'Achat assure avec prime SCHL', 8,
   'Banque Nationale', 'Assure SCHL', 'Approuve', 4.79, 'Fixe', 60, 48, true, 'Acceptee', true, 'SCHL approuvee'),
  (20, 'Gabriel', 'Dubois', '514-700-2020', 'riadh.scenario20@example.test',
   'Pret a fermer', 'Achat urgent', 'Salarie', 'Logistique GD', 94000,
   585000, 585000, NULL, 526500, 58500,
   'Fermeture urgente avec suivis en retard', -7,
   'TD', 'Conventionnel', 'Final', 4.64, 'Fixe', 60, 5, true, 'Acceptee', false, 'Preuve manquante');

INSERT INTO public.clients (
    representant_id, nom_client, prenom, nom, telephone, courriel,
    type_emploi, employeur, revenu_annuel, type_transaction,
    prix_achat, valeur_propriete, solde_hypothecaire,
    montant_financement, mise_de_fonds, objectif, date_rappel,
    statut_dossier, niveau_confiance, resume
)
SELECT
    r.representant_id,
    concat_ws(' ', s.prenom, s.nom), s.prenom, s.nom,
    s.telephone, s.courriel, s.type_emploi, s.employeur,
    s.revenu_annuel, s.type_transaction, s.prix_achat,
    s.valeur_propriete, s.solde_hypothecaire, s.montant_financement,
    CASE WHEN s.mise_de_fonds IS NULL THEN NULL ELSE s.mise_de_fonds::text END,
    s.objectif, current_date + s.rappel_jours, s.statut,
    'Donnees de demonstration',
    format('Scenario %s - %s', s.numero, s.objectif)
FROM riadh_scenarios s
CROSS JOIN public.representants r
WHERE r.code_representant = '2026999998'
  AND NOT EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.representant_id = r.representant_id
        AND lower(c.courriel) = lower(s.courriel)
  );

UPDATE public.clients c SET
    nom_client = concat_ws(' ', s.prenom, s.nom),
    prenom = s.prenom,
    nom = s.nom,
    telephone = s.telephone,
    type_emploi = s.type_emploi,
    employeur = s.employeur,
    revenu_annuel = s.revenu_annuel,
    type_transaction = s.type_transaction,
    prix_achat = s.prix_achat,
    valeur_propriete = s.valeur_propriete,
    solde_hypothecaire = s.solde_hypothecaire,
    montant_financement = s.montant_financement,
    mise_de_fonds = CASE WHEN s.mise_de_fonds IS NULL THEN NULL ELSE s.mise_de_fonds::text END,
    objectif = s.objectif,
    date_rappel = current_date + s.rappel_jours,
    statut_dossier = s.statut,
    niveau_confiance = 'Donnees de demonstration',
    resume = format('Scenario %s - %s', s.numero, s.objectif),
    updated_at = now()
FROM riadh_scenarios s
WHERE lower(c.courriel) = lower(s.courriel)
  AND c.representant_id = current_setting('app.representant_id')::uuid;

UPDATE public.dossiers_hypothecaires d SET
    statut_dossier = s.statut,
    type_transaction = s.type_transaction,
    objectif = s.objectif,
    updated_at = now()
FROM public.dossier_clients dc
JOIN public.clients c ON c.client_id = dc.client_id AND dc.est_principal
JOIN riadh_scenarios s ON lower(s.courriel) = lower(c.courriel)
WHERE d.dossier_id = dc.dossier_id;

INSERT INTO public.details_hypothecaires (
    client_id, representant_id, preteur, produit, statut_approbation,
    taux_interet, type_taux, terme_mois, amortissement_annees,
    date_fermeture, evaluation_requise, evaluation_statut,
    assurance_requise, assurance_statut, prix_achat,
    mise_de_fonds, montant_requis, source_demande, statut_soumission
)
SELECT
    c.client_id, c.representant_id, s.preteur, s.produit,
    s.statut_approbation, s.taux, s.type_taux, s.terme_mois, 25,
    CASE WHEN s.fermeture_jours IS NULL THEN NULL
         ELSE current_date + s.fermeture_jours END,
    s.evaluation_requise, s.evaluation_statut,
    s.assurance_requise, s.assurance_statut,
    s.prix_achat, s.mise_de_fonds, s.montant_financement,
    'Jeu de tests Riadh', s.statut
FROM riadh_scenarios s
JOIN public.clients c ON lower(c.courriel) = lower(s.courriel)
ON CONFLICT (client_id) DO UPDATE SET
    preteur = EXCLUDED.preteur,
    produit = EXCLUDED.produit,
    statut_approbation = EXCLUDED.statut_approbation,
    taux_interet = EXCLUDED.taux_interet,
    type_taux = EXCLUDED.type_taux,
    terme_mois = EXCLUDED.terme_mois,
    date_fermeture = EXCLUDED.date_fermeture,
    evaluation_requise = EXCLUDED.evaluation_requise,
    evaluation_statut = EXCLUDED.evaluation_statut,
    assurance_requise = EXCLUDED.assurance_requise,
    assurance_statut = EXCLUDED.assurance_statut,
    prix_achat = EXCLUDED.prix_achat,
    mise_de_fonds = EXCLUDED.mise_de_fonds,
    montant_requis = EXCLUDED.montant_requis,
    source_demande = EXCLUDED.source_demande,
    statut_soumission = EXCLUDED.statut_soumission,
    updated_at = now();

CREATE TEMPORARY TABLE riadh_documents (
    numero integer, document text, statut text
) ON COMMIT DROP;
INSERT INTO riadh_documents VALUES
  (1, 'Lettre d emploi', 'A recevoir'),
  (1, 'Releve de mise de fonds', 'A recevoir'),
  (2, 'Avis de cotisation - 2 ans', 'A recevoir'),
  (2, 'Etats financiers entreprise', 'En attente'),
  (3, 'Releves bancaires - 90 jours', 'A recevoir'),
  (3, 'Preuve des dettes a consolider', 'A recevoir'),
  (4, 'Promesse d achat', 'Recu'),
  (5, 'Preuve de revenu', 'Recu'),
  (6, 'Confirmation d emploi', 'A recevoir'),
  (7, 'Preuve de mise de fonds', 'Recu'),
  (8, 'Preuve assurance habitation', 'Recu'),
  (9, 'Instructions au notaire', 'Recu'),
  (10, 'Plan de remboursement des dettes', 'A recevoir'),
  (11, 'Offre de renouvellement actuelle', 'Recu'),
  (12, 'Baux locatifs', 'A recevoir'),
  (12, 'T1 general - 2 ans', 'A recevoir'),
  (13, 'Plans et devis de construction', 'A recevoir'),
  (13, 'Permis de construction', 'En attente'),
  (14, 'Baux du duplex', 'A recevoir'),
  (15, 'Permis de travail', 'A recevoir'),
  (15, 'Historique de credit international', 'En attente'),
  (16, 'Releves de commissions - 2 ans', 'A recevoir'),
  (17, 'Convention de separation', 'A recevoir'),
  (18, 'Promesse d achat de la propriete vendue', 'A recevoir'),
  (19, 'Certificat SCHL', 'Recu'),
  (20, 'Preuve assurance habitation', 'A recevoir');

INSERT INTO public.documents_requis (
    client_id, representant_id, document, statut, date_demande
)
SELECT c.client_id, c.representant_id, d.document, d.statut,
       current_date - ((d.numero % 5) + 1)
FROM riadh_documents d
JOIN riadh_scenarios s ON s.numero = d.numero
JOIN public.clients c ON lower(c.courriel) = lower(s.courriel)
WHERE NOT EXISTS (
    SELECT 1 FROM public.documents_requis existant
    WHERE existant.client_id = c.client_id
      AND lower(existant.document) = lower(d.document)
);

CREATE TEMPORARY TABLE riadh_taches (
    numero integer, titre text, description text, echeance_jours integer, statut text
) ON COMMIT DROP;
INSERT INTO riadh_taches VALUES
  (1, 'Appel de decouverte', 'Valider le budget et les criteres de recherche', 1, 'Ouverte'),
  (2, 'Relancer pour documents autonomes', 'Obtenir avis de cotisation et etats financiers', -2, 'Ouverte'),
  (3, 'Verifier les dettes a consolider', 'Confirmer soldes et paiements mensuels', -3, 'En cours'),
  (4, 'Suivre l evaluation', 'Confirmer le rendez-vous avec l evaluateur', 2, 'Ouverte'),
  (5, 'Suivi de preapprobation', 'Mettre a jour la recherche de propriete', 7, 'Ouverte'),
  (6, 'Lever la condition d emploi', 'Transmettre la confirmation au preteur', 0, 'Ouverte'),
  (7, 'Assigner le notaire', 'Obtenir les coordonnees du notaire', 3, 'Ouverte'),
  (8, 'Confirmer assurance', 'Valider que la preuve est acceptee', 1, 'En cours'),
  (9, 'Appel post-fermeture', 'Confirmer la satisfaction de la cliente', 14, 'Ouverte'),
  (10, 'Planifier nouvelle strategie', 'Reduire les dettes avant une nouvelle demande', 14, 'Ouverte'),
  (11, 'Comparer les offres', 'Presenter fixe versus variable', 3, 'Ouverte'),
  (12, 'Recevoir les baux', 'Calculer le revenu locatif admissible', -4, 'Ouverte'),
  (13, 'Valider budget construction', 'Revoir devis et contingence', 5, 'En cours'),
  (14, 'Analyser revenus locatifs', 'Verifier les baux du duplex', -1, 'Ouverte'),
  (15, 'Valider admissibilite nouvel arrivant', 'Verifier permis et historique de credit', 1, 'Ouverte'),
  (16, 'Calculer moyenne des commissions', 'Moyenne sur deux annees fiscales', -3, 'En cours'),
  (17, 'Obtenir convention de separation', 'Valider le montant du rachat de part', 2, 'Ouverte'),
  (18, 'Coordonner le pret relais', 'Synchroniser vente et achat', 4, 'Ouverte'),
  (19, 'Confirmer prime SCHL', 'Ajouter la prime au financement', 6, 'Ouverte'),
  (20, 'Urgent - preuve assurance', 'Relancer avant la fermeture', -2, 'Ouverte');

INSERT INTO public.taches (
    client_id, representant_id, titre, description, date_echeance, statut
)
SELECT c.client_id, c.representant_id, t.titre, t.description,
       current_date + t.echeance_jours, t.statut
FROM riadh_taches t
JOIN riadh_scenarios s ON s.numero = t.numero
JOIN public.clients c ON lower(c.courriel) = lower(s.courriel)
WHERE NOT EXISTS (
    SELECT 1 FROM public.taches existante
    WHERE existante.client_id = c.client_id
      AND lower(existante.titre) = lower(t.titre)
);

-- Quelques codemandeurs structurent les scenarios familiaux sans creer de
-- comptes de connexion supplementaires.
INSERT INTO public.participants_dossier (
    client_id, representant_id, role_participant,
    prenom, nom, courriel, meme_adresse_client
)
SELECT c.client_id, c.representant_id, 'Codemandeur',
       p.prenom, p.nom, p.courriel, true
FROM (VALUES
    (4, 'Maya', 'Haddad', 'maya.haddad@example.test'),
    (7, 'Louis', 'Tremblay', 'louis.tremblay@example.test'),
    (13, 'Hugo', 'Morin', 'hugo.morin@example.test'),
    (18, 'Camille', 'Bernier', 'camille.bernier@example.test'),
    (19, 'Youssef', 'El Amrani', 'youssef.elamrani@example.test')
) p(numero, prenom, nom, courriel)
JOIN riadh_scenarios s ON s.numero = p.numero
JOIN public.clients c ON lower(c.courriel) = lower(s.courriel)
WHERE NOT EXISTS (
    SELECT 1 FROM public.participants_dossier existant
    WHERE existant.client_id = c.client_id
      AND lower(existant.courriel) = lower(p.courriel)
);

COMMIT;
