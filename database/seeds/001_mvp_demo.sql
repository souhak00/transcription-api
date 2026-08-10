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
        ('20000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, timestamptz '2026-08-09 10:12:00-04', 'Appel', 'Validation du budget et des documents requis.')
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
        ('30000000-0000-4000-8000-000000000014'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'Relevé bancaire', 'A recevoir')
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
        ('40000000-0000-4000-8000-000000000012'::uuid, '10000000-0000-4000-8000-000000000012'::uuid, '20000000-0000-4000-8000-000000000012'::uuid, 'Relancer pour les preuves de revenu', 'Demander les deux dernières preuves de revenu.', date '2026-08-12', 'Ouverte')
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

COMMIT;
