-- Données fictives pour la démonstration locale du MVP.
-- Script réexécutable : seules les lignes portant les UUID fixes ci-dessous
-- sont insérées ou remises à leur état de démonstration.

BEGIN;

INSERT INTO public.representants (
    code_representant,
    nom_representant,
    courriel,
    equipe,
    actif
)
VALUES (
    '2026999999',
    'Représentant MVP',
    'representant-mvp@example.test',
    'Hypothécaire',
    true
)
ON CONFLICT (code_representant) DO NOTHING;

WITH donnees (
    client_id,
    nom_client,
    courriel,
    type_emploi,
    employeur,
    revenu_annuel,
    type_transaction,
    objectif,
    statut_dossier,
    niveau_confiance,
    resume,
    created_at
) AS (
    VALUES
        ('10000000-0000-4000-8000-000000000001'::uuid, 'Alice Beaulieu', 'alice.beaulieu@example.test', 'Salariée', 'Atelier Boréal', 78000::numeric, 'Premier achat', 'Acheter un condo', 'Nouveau', 'Élevé', 'Premier échange complété.', timestamptz '2026-08-09 09:01:00-04'),
        ('10000000-0000-4000-8000-000000000002'::uuid, 'Marc Desjardins', 'marc.desjardins@example.test', 'Autonome', 'Desjardins Design', 92000::numeric, 'Refinancement', 'Consolider des dettes', 'En analyse', 'Moyen', 'Revenus autonomes à documenter.', timestamptz '2026-08-09 09:02:00-04'),
        ('10000000-0000-4000-8000-000000000003'::uuid, 'Sophie Gagnon', 'sophie.gagnon@example.test', 'Salariée', 'Clinique du Parc', 86000::numeric, 'Achat', 'Acheter une maison', 'Documents requis', 'Élevé', 'Documents de revenu demandés.', timestamptz '2026-08-09 09:03:00-04'),
        ('10000000-0000-4000-8000-000000000004'::uuid, 'Daniel Roy', 'daniel.roy@example.test', 'Retraité', 'Retraite', 54000::numeric, 'Renouvellement', 'Comparer les options de renouvellement', 'En analyse', 'Élevé', 'Renouvellement prévu cet automne.', timestamptz '2026-08-09 09:04:00-04'),
        ('10000000-0000-4000-8000-000000000005'::uuid, 'Nadia Bouchard', 'nadia.bouchard@example.test', 'Salariée', 'Groupe Laurentien', 101000::numeric, 'Achat', 'Acheter un plex', 'Nouveau', 'Moyen', 'Valeur de la propriété à confirmer.', timestamptz '2026-08-09 09:05:00-04'),
        ('10000000-0000-4000-8000-000000000006'::uuid, 'Étienne Fortin', 'etienne.fortin@example.test', 'Contractuel', 'Solutions Nord', 83000::numeric, 'Premier achat', 'Acheter une propriété', 'Préqualification', 'Moyen', 'Historique de contrats à valider.', timestamptz '2026-08-09 09:06:00-04'),
        ('10000000-0000-4000-8000-000000000007'::uuid, 'Karine Pelletier', 'karine.pelletier@example.test', 'Salariée', 'École du Fleuve', 74000::numeric, 'Refinancement', 'Financer des rénovations', 'Documents requis', 'Élevé', 'Soumissions de rénovation attendues.', timestamptz '2026-08-09 09:07:00-04'),
        ('10000000-0000-4000-8000-000000000008'::uuid, 'Louis Côté', 'louis.cote@example.test', 'Autonome', 'Côté Services', 118000::numeric, 'Achat', 'Acheter une résidence secondaire', 'En analyse', 'Moyen', 'États financiers requis.', timestamptz '2026-08-09 09:08:00-04'),
        ('10000000-0000-4000-8000-000000000009'::uuid, 'Amélie Morin', 'amelie.morin@example.test', 'Salariée', 'Techno Québec', 96000::numeric, 'Achat', 'Acheter un condo', 'Préapprouvé', 'Élevé', 'Préapprobation complétée.', timestamptz '2026-08-09 09:09:00-04'),
        ('10000000-0000-4000-8000-000000000010'::uuid, 'Philippe Lavoie', 'philippe.lavoie@example.test', 'Salarié', 'Transport Métro', 81000::numeric, 'Renouvellement', 'Réduire le paiement mensuel', 'Nouveau', 'Élevé', 'Premier appel à planifier.', timestamptz '2026-08-09 09:10:00-04'),
        ('10000000-0000-4000-8000-000000000011'::uuid, 'Chloé Simard', 'chloe.simard@example.test', 'Salariée', 'Studio Créatif', 69000::numeric, 'Premier achat', 'Acheter une première maison', 'Documents requis', 'Élevé', 'Preuve de mise de fonds attendue.', timestamptz '2026-08-09 09:11:00-04'),
        ('10000000-0000-4000-8000-000000000012'::uuid, 'Olivier Bergeron', 'olivier.bergeron@example.test', 'Salarié', 'Industries du Lac', 105000::numeric, 'Achat', 'Acheter une maison familiale', 'En analyse', 'Élevé', 'Analyse des documents en cours.', timestamptz '2026-08-09 09:12:00-04')
)
INSERT INTO public.clients (
    client_id,
    representant_id,
    nom_client,
    courriel,
    type_emploi,
    employeur,
    revenu_annuel,
    type_transaction,
    objectif,
    statut_dossier,
    niveau_confiance,
    resume,
    created_at,
    updated_at
)
SELECT
    donnees.client_id,
    representant.representant_id,
    donnees.nom_client,
    donnees.courriel,
    donnees.type_emploi,
    donnees.employeur,
    donnees.revenu_annuel,
    donnees.type_transaction,
    donnees.objectif,
    donnees.statut_dossier,
    donnees.niveau_confiance,
    donnees.resume,
    donnees.created_at,
    donnees.created_at
FROM donnees
CROSS JOIN (
    SELECT representant_id
    FROM public.representants
    WHERE code_representant = '2026999999'
) representant
ON CONFLICT (client_id) DO UPDATE
SET
    representant_id = EXCLUDED.representant_id,
    nom_client = EXCLUDED.nom_client,
    courriel = EXCLUDED.courriel,
    type_emploi = EXCLUDED.type_emploi,
    employeur = EXCLUDED.employeur,
    revenu_annuel = EXCLUDED.revenu_annuel,
    type_transaction = EXCLUDED.type_transaction,
    objectif = EXCLUDED.objectif,
    statut_dossier = EXCLUDED.statut_dossier,
    niveau_confiance = EXCLUDED.niveau_confiance,
    resume = EXCLUDED.resume,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

-- Cas de référence utilisé par la matrice des 100 questions de l'agent.
INSERT INTO public.clients (
    client_id,
    representant_id,
    nom_client,
    telephone,
    courriel,
    type_emploi,
    employeur,
    revenu_annuel,
    type_transaction,
    prix_achat,
    valeur_propriete,
    solde_hypothecaire,
    montant_financement,
    mise_de_fonds,
    provenance_mise_de_fonds,
    dettes_totales,
    objectif,
    date_rappel,
    statut_dossier,
    niveau_confiance,
    resume,
    created_at,
    updated_at
)
SELECT
    '10000000-0000-4000-8000-000000000013'::uuid,
    representant.representant_id,
    'Benoît Tremblay',
    '514-555-0113',
    'benoit.tremblay@example.test',
    'Salarié',
    'Construction Québec',
    98000::numeric,
    'Refinancement',
    525000::numeric,
    550000::numeric,
    310000::numeric,
    390000::numeric,
    '78 000 $ (20 %)',
    'Épargne personnelle et RAP',
    24000::numeric,
    'Refinancer et consolider les dettes',
    date '2026-08-18',
    'En analyse',
    'Élevé',
    'Documents reçus en partie; analyse du financement en cours.',
    timestamptz '2026-08-10 09:00:00-04',
    timestamptz '2026-08-10 15:30:00-04'
FROM public.representants representant
WHERE representant.code_representant = '2026999999'
ON CONFLICT (client_id) DO UPDATE
SET
    representant_id = EXCLUDED.representant_id,
    nom_client = EXCLUDED.nom_client,
    telephone = EXCLUDED.telephone,
    courriel = EXCLUDED.courriel,
    type_emploi = EXCLUDED.type_emploi,
    employeur = EXCLUDED.employeur,
    revenu_annuel = EXCLUDED.revenu_annuel,
    type_transaction = EXCLUDED.type_transaction,
    prix_achat = EXCLUDED.prix_achat,
    valeur_propriete = EXCLUDED.valeur_propriete,
    solde_hypothecaire = EXCLUDED.solde_hypothecaire,
    montant_financement = EXCLUDED.montant_financement,
    mise_de_fonds = EXCLUDED.mise_de_fonds,
    provenance_mise_de_fonds = EXCLUDED.provenance_mise_de_fonds,
    dettes_totales = EXCLUDED.dettes_totales,
    objectif = EXCLUDED.objectif,
    date_rappel = EXCLUDED.date_rappel,
    statut_dossier = EXCLUDED.statut_dossier,
    niveau_confiance = EXCLUDED.niveau_confiance,
    resume = EXCLUDED.resume,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.details_hypothecaires (
    detail_id,
    client_id,
    representant_id,
    preteur,
    produit,
    statut_approbation,
    date_approbation,
    conditions_approbation,
    taux_interet,
    type_taux,
    terme_mois,
    amortissement_annees,
    date_fermeture,
    date_decaissement,
    notaire_nom,
    notaire_telephone,
    instructions_notaire_statut,
    instructions_notaire_date,
    evaluation_requise,
    evaluation_statut,
    evaluateur_nom,
    evaluation_date,
    valeur_evaluee,
    assurance_requise,
    assureur_pret,
    assurance_statut,
    prime_assurance,
    created_at,
    updated_at
)
SELECT
    '50000000-0000-4000-8000-000000000013'::uuid,
    client.client_id,
    client.representant_id,
    'Banque Nationale',
    'Refinancement conventionnel',
    'Approuvé conditionnel',
    date '2026-08-12',
    'Confirmation finale de l’emploi et relevé bancaire à jour',
    4.7900::numeric,
    'Fixe',
    60,
    25,
    date '2026-09-15',
    date '2026-09-14',
    'Me Sophie Girard',
    '514-555-0199',
    'Envoyées',
    date '2026-08-13',
    true,
    'Terminée',
    'Évaluations Laurentides',
    date '2026-08-11',
    550000::numeric,
    false,
    NULL,
    'Non requise',
    0::numeric,
    timestamptz '2026-08-10 15:30:00-04',
    timestamptz '2026-08-13 11:00:00-04'
FROM public.clients client
WHERE client.client_id = '10000000-0000-4000-8000-000000000013'::uuid
ON CONFLICT (detail_id) DO UPDATE
SET
    client_id = EXCLUDED.client_id,
    representant_id = EXCLUDED.representant_id,
    preteur = EXCLUDED.preteur,
    produit = EXCLUDED.produit,
    statut_approbation = EXCLUDED.statut_approbation,
    date_approbation = EXCLUDED.date_approbation,
    conditions_approbation = EXCLUDED.conditions_approbation,
    taux_interet = EXCLUDED.taux_interet,
    type_taux = EXCLUDED.type_taux,
    terme_mois = EXCLUDED.terme_mois,
    amortissement_annees = EXCLUDED.amortissement_annees,
    date_fermeture = EXCLUDED.date_fermeture,
    date_decaissement = EXCLUDED.date_decaissement,
    notaire_nom = EXCLUDED.notaire_nom,
    notaire_telephone = EXCLUDED.notaire_telephone,
    instructions_notaire_statut = EXCLUDED.instructions_notaire_statut,
    instructions_notaire_date = EXCLUDED.instructions_notaire_date,
    evaluation_requise = EXCLUDED.evaluation_requise,
    evaluation_statut = EXCLUDED.evaluation_statut,
    evaluateur_nom = EXCLUDED.evaluateur_nom,
    evaluation_date = EXCLUDED.evaluation_date,
    valeur_evaluee = EXCLUDED.valeur_evaluee,
    assurance_requise = EXCLUDED.assurance_requise,
    assureur_pret = EXCLUDED.assureur_pret,
    assurance_statut = EXCLUDED.assurance_statut,
    prime_assurance = EXCLUDED.prime_assurance,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.interactions (
    interaction_id,
    client_id,
    representant_id,
    date_appel,
    type_interaction,
    resume,
    niveau_confiance,
    created_at
)
SELECT
    interaction.interaction_id,
    interaction.client_id,
    client.representant_id,
    interaction.date_appel,
    interaction.type_interaction,
    interaction.resume,
    'Élevé',
    interaction.date_appel
FROM (
    VALUES
        ('20000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, timestamptz '2026-08-09 10:00:00-04', 'Appel', 'Présentation du projet de premier achat.'),
        ('20000000-0000-4000-8000-000000000005'::uuid, '10000000-0000-4000-8000-000000000005'::uuid, timestamptz '2026-08-09 10:05:00-04', 'Courriel', 'Réception des informations préliminaires sur le plex.'),
        ('20000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, timestamptz '2026-08-09 10:12:00-04', 'Appel', 'Validation du budget et des documents requis.'),
        ('20000000-0000-4000-8000-000000000013'::uuid, '10000000-0000-4000-8000-000000000013'::uuid, timestamptz '2026-08-10 14:00:00-04', 'Suivi', 'Validation du revenu, de la mise de fonds et du montant de financement.')
) AS interaction(interaction_id, client_id, date_appel, type_interaction, resume)
JOIN public.clients client ON client.client_id = interaction.client_id
ON CONFLICT (interaction_id) DO UPDATE
SET
    client_id = EXCLUDED.client_id,
    representant_id = EXCLUDED.representant_id,
    date_appel = EXCLUDED.date_appel,
    type_interaction = EXCLUDED.type_interaction,
    resume = EXCLUDED.resume,
    niveau_confiance = EXCLUDED.niveau_confiance,
    created_at = EXCLUDED.created_at;

INSERT INTO public.documents_requis (
    document_id,
    client_id,
    interaction_id,
    representant_id,
    document,
    statut,
    date_demande,
    created_at
)
SELECT
    document.document_id,
    document.client_id,
    document.interaction_id,
    client.representant_id,
    document.document,
    document.statut,
    date '2026-08-09',
    timestamptz '2026-08-09 10:15:00-04'
FROM (
    VALUES
        ('30000000-0000-4000-8000-000000000011'::uuid, '10000000-0000-4000-8000-000000000011'::uuid, NULL::uuid, 'Preuve de mise de fonds', 'A recevoir'),
        ('30000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'Pièce d’identité', 'Reçu'),
        ('30000000-0000-4000-8000-000000000013'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'Preuve de revenu', 'A recevoir'),
        ('30000000-0000-4000-8000-000000000014'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'Relevé bancaire', 'A recevoir'),
        ('30000000-0000-4000-8000-000000000015'::uuid, '10000000-0000-4000-8000-000000000013'::uuid, '20000000-0000-4000-8000-000000000013'::uuid, 'État civil', 'A recevoir'),
        ('30000000-0000-4000-8000-000000000016'::uuid, '10000000-0000-4000-8000-000000000013'::uuid, '20000000-0000-4000-8000-000000000013'::uuid, 'Lettre d''emploi', 'A recevoir'),
        ('30000000-0000-4000-8000-000000000017'::uuid, '10000000-0000-4000-8000-000000000013'::uuid, '20000000-0000-4000-8000-000000000013'::uuid, 'Montant de la dette', 'A recevoir')
) AS document(document_id, client_id, interaction_id, document, statut)
JOIN public.clients client ON client.client_id = document.client_id
ON CONFLICT (document_id) DO UPDATE
SET
    client_id = EXCLUDED.client_id,
    interaction_id = EXCLUDED.interaction_id,
    representant_id = EXCLUDED.representant_id,
    document = EXCLUDED.document,
    statut = EXCLUDED.statut,
    date_demande = EXCLUDED.date_demande,
    created_at = EXCLUDED.created_at;

INSERT INTO public.taches (
    tache_id,
    client_id,
    representant_id,
    interaction_id,
    titre,
    description,
    date_echeance,
    statut,
    created_at
)
SELECT
    tache.tache_id,
    tache.client_id,
    client.representant_id,
    tache.interaction_id,
    tache.titre,
    tache.description,
    tache.date_echeance,
    tache.statut,
    timestamptz '2026-08-09 10:20:00-04'
FROM (
    VALUES
        ('40000000-0000-4000-8000-000000000001'::uuid, '10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, 'Envoyer la simulation de paiement', 'Préparer trois scénarios de paiement.', date '2026-08-10', 'Terminée'),
        ('40000000-0000-4000-8000-000000000005'::uuid, '10000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000005'::uuid, 'Valider la valeur de la propriété', 'Confirmer la valeur estimée du plex.', date '2026-08-11', 'En cours'),
        ('40000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'Relancer pour les preuves de revenu', 'Demander les deux dernières preuves de revenu.', date '2026-08-12', 'Ouverte'),
        ('40000000-0000-4000-8000-000000000013'::uuid, '10000000-0000-4000-8000-000000000013'::uuid, '20000000-0000-4000-8000-000000000013'::uuid, 'Valider les documents restants', 'Relancer Benoît pour les trois pièces manquantes.', date '2026-08-18', 'Ouverte')
) AS tache(tache_id, client_id, interaction_id, titre, description, date_echeance, statut)
JOIN public.clients client ON client.client_id = tache.client_id
ON CONFLICT (tache_id) DO UPDATE
SET
    client_id = EXCLUDED.client_id,
    representant_id = EXCLUDED.representant_id,
    interaction_id = EXCLUDED.interaction_id,
    titre = EXCLUDED.titre,
    description = EXCLUDED.description,
    date_echeance = EXCLUDED.date_echeance,
    statut = EXCLUDED.statut,
    created_at = EXCLUDED.created_at;

-- Profil et demande enrichis, entièrement fictifs, pour valider la fiche détaillée.
UPDATE public.clients
SET
    prenom = 'Benoît',
    nom = 'Tremblay',
    date_naissance = date '1984-04-19',
    telephone_type = 'Cellulaire',
    canal_contact_prefere = 'Téléphone',
    moment_contact_prefere = 'Soirée',
    adresse_numero_civique = '1250',
    adresse_rue = 'René-Lévesque',
    adresse_type_rue = 'Boulevard',
    adresse_ville = 'Québec',
    adresse_province = 'Québec',
    adresse_code_postal = 'G1R 2L3',
    adresse_pays = 'Canada',
    adresse_validee = true
WHERE client_id = '10000000-0000-4000-8000-000000000013'::uuid;

UPDATE public.details_hypothecaires
SET
    echeancier_projet = 'Dans les 6 prochains mois',
    type_propriete = 'Maison unifamiliale',
    type_occupation = 'Occupée par le propriétaire',
    prix_achat = 525000,
    mise_de_fonds = 78000,
    montant_requis = 390000,
    commentaires = 'Données fictives de démonstration du dossier enrichi.',
    source_demande = 'Formulaire Web',
    date_soumission = timestamptz '2026-08-10 14:00:00-04',
    statut_soumission = 'Soumise'
WHERE client_id = '10000000-0000-4000-8000-000000000013'::uuid;

INSERT INTO public.participants_dossier (
    participant_id, client_id, representant_id, role_participant,
    prenom, nom, date_naissance, telephone, telephone_type, courriel,
    meme_adresse_client, canal_contact_prefere, moment_contact_prefere
)
SELECT
    '60000000-0000-4000-8000-000000000013'::uuid,
    c.client_id, c.representant_id, 'Codemandeur',
    'Marie', 'Tremblay', date '1986-07-12', '514-555-0120',
    'Cellulaire', 'marie.tremblay@example.test', true, 'Courriel', 'Soirée'
FROM public.clients c
WHERE c.client_id = '10000000-0000-4000-8000-000000000013'::uuid
ON CONFLICT (participant_id) DO UPDATE SET
    representant_id = EXCLUDED.representant_id,
    prenom = EXCLUDED.prenom,
    nom = EXCLUDED.nom,
    date_naissance = EXCLUDED.date_naissance,
    telephone = EXCLUDED.telephone,
    telephone_type = EXCLUDED.telephone_type,
    courriel = EXCLUDED.courriel,
    meme_adresse_client = EXCLUDED.meme_adresse_client,
    canal_contact_prefere = EXCLUDED.canal_contact_prefere,
    moment_contact_prefere = EXCLUDED.moment_contact_prefere,
    updated_at = now();

INSERT INTO public.consentements_dossier (
    consentement_id, client_id, representant_id, type_consentement,
    version_texte, accepte, accepte_at, canal, reference_preuve
)
SELECT
    consentement.consentement_id,
    c.client_id,
    c.representant_id,
    consentement.type_consentement,
    '2026-08',
    true,
    timestamptz '2026-08-10 14:00:00-04',
    'Formulaire Web',
    consentement.reference_preuve
FROM public.clients c
CROSS JOIN (VALUES
    ('70000000-0000-4000-8000-000000000011'::uuid, 'Recherche de crédit', 'CONSENT-CREDIT-DEMO'),
    ('70000000-0000-4000-8000-000000000012'::uuid, 'Confidentialité et admissibilité', 'CONSENT-PRIV-DEMO'),
    ('70000000-0000-4000-8000-000000000013'::uuid, 'Communications anti-pourriel', 'CONSENT-COMM-DEMO')
) consentement(consentement_id, type_consentement, reference_preuve)
WHERE c.client_id = '10000000-0000-4000-8000-000000000013'::uuid
ON CONFLICT (consentement_id) DO UPDATE SET
    representant_id = EXCLUDED.representant_id,
    type_consentement = EXCLUDED.type_consentement,
    version_texte = EXCLUDED.version_texte,
    accepte = EXCLUDED.accepte,
    accepte_at = EXCLUDED.accepte_at,
    canal = EXCLUDED.canal,
    reference_preuve = EXCLUDED.reference_preuve;

COMMIT;
