-- Active l'extension PostgreSQL qui permet de generer des identifiants UUID.
create extension if not exists pgcrypto;

-- Stocke les conseillers ou representants hypothecaires.
create table if not exists representants (
  -- Identifiant technique unique du representant.
  representant_id uuid primary key default gen_random_uuid(),
  -- Code metier lisible, par exemple REP-001.
  code_representant text unique not null,
  -- Le code metier du representant doit contenir 10 chiffres et commencer par une annee.
  constraint chk_representants_code_representant_format
    check (
      code_representant ~ '^[0-9]{10}$'
      and substring(code_representant from 1 for 4)::int between 2020 and 2099
    ),
  -- Nom complet du representant.
  nom_representant text not null,
  -- Courriel professionnel du representant.
  courriel text,
  -- Telephone professionnel du representant.
  telephone text,
  -- Equipe ou departement du representant.
  equipe text default 'Hypothecaire',
  -- Indique si le representant peut encore recevoir de nouveaux dossiers.
  actif boolean not null default true,
  -- Date de creation de la fiche representant.
  created_at timestamptz not null default now(),
  -- Date de derniere mise a jour de la fiche representant.
  updated_at timestamptz not null default now()
);

-- Stocke la fiche client courante, rattachee a un representant.
create table if not exists clients (
  -- Identifiant technique unique du client.
  client_id uuid primary key default gen_random_uuid(),
  -- Representant responsable du client.
  representant_id uuid not null references representants(representant_id),
  -- Nom complet du client extrait par l'IA ou corrige manuellement.
  nom_client text,
  -- Telephone principal normalise si possible.
  telephone text,
  -- Courriel principal normalise si possible.
  courriel text,
  -- Type d'emploi: salarie, autonome, retraite, sans emploi, etc.
  type_emploi text,
  -- Employeur ou source principale d'activite.
  employeur text,
  -- Revenu annuel du client.
  revenu_annuel numeric,
  -- Revenu annuel du conjoint si mentionne.
  revenu_conjoint numeric,
  -- Type de dossier: refinancement, achat, renouvellement, etc.
  type_transaction text,
  -- Prix d'achat de la propriete si applicable.
  prix_achat numeric,
  -- Valeur estimee ou mentionnee de la propriete.
  valeur_propriete numeric,
  -- Solde hypothecaire restant.
  solde_hypothecaire numeric,
  -- Montant de financement souhaite.
  montant_financement numeric,
  -- Montant ou pourcentage de mise de fonds.
  mise_de_fonds text,
  -- Source de la mise de fonds.
  provenance_mise_de_fonds text,
  -- Dettes totales mentionnees.
  dettes_totales numeric,
  -- Objectif principal du client.
  objectif text,
  -- Date de rappel ou prochaine relance.
  date_rappel date,
  -- Informations fiscales utiles au dossier.
  informations_fiscales text,
  -- Statut courant du dossier client.
  statut_dossier text not null default 'Nouveau',
  -- Niveau de confiance retourne par l'extraction IA.
  niveau_confiance text,
  -- Resume court du dossier.
  resume text,
  -- Date de creation de la fiche client.
  created_at timestamptz not null default now(),
  -- Date de derniere mise a jour de la fiche client.
  updated_at timestamptz not null default now()
);

-- Empeche deux fiches client avec le meme telephone pour le meme representant.
create unique index if not exists ux_clients_representant_telephone
on clients (representant_id, telephone)
where telephone is not null and btrim(telephone) <> '';

-- Empeche deux fiches client avec le meme courriel pour le meme representant.
create unique index if not exists ux_clients_representant_courriel
on clients (representant_id, lower(courriel))
where courriel is not null and btrim(courriel) <> '';

-- Stocke chaque appel ou interaction traitee par le workflow.
create table if not exists interactions (
  -- Identifiant technique unique de l'interaction.
  interaction_id uuid primary key default gen_random_uuid(),
  -- Client rattache a l'interaction.
  client_id uuid references clients(client_id),
  -- Representant rattache a l'interaction.
  representant_id uuid not null references representants(representant_id),
  -- Date et heure de l'appel ou du traitement.
  date_appel timestamptz not null default now(),
  -- Type d'interaction, par exemple Appel, Courriel ou Suivi.
  type_interaction text not null default 'Appel',
  -- Nom du fichier audio original.
  fichier_original_nom text,
  -- URL Drive de la transcription originale.
  transcription_originale_url text,
  -- URL Drive de la synthese IA.
  synthese_url text,
  -- JSON complet extrait par Ollama.
  fiche_json jsonb,
  -- Resume court de l'interaction.
  resume text,
  -- Niveau de confiance de l'extraction.
  niveau_confiance text,
  -- Date de creation de l'interaction.
  created_at timestamptz not null default now()
);

-- Stocke les documents demandes ou manquants.
create table if not exists documents_requis (
  -- Identifiant technique unique du document requis.
  document_id uuid primary key default gen_random_uuid(),
  -- Client concerne par le document.
  client_id uuid references clients(client_id),
  -- Interaction qui a genere la demande.
  interaction_id uuid references interactions(interaction_id),
  -- Representant responsable du suivi.
  representant_id uuid not null references representants(representant_id),
  -- Nom du document a demander.
  document text not null,
  -- Statut de reception du document.
  statut text not null default 'A recevoir',
  -- Date de demande du document.
  date_demande date not null default current_date,
  -- Date de creation technique.
  created_at timestamptz not null default now()
);

-- Stocke les actions de suivi creees depuis la transcription.
create table if not exists taches (
  -- Identifiant technique unique de la tache.
  tache_id uuid primary key default gen_random_uuid(),
  -- Client concerne par la tache.
  client_id uuid references clients(client_id),
  -- Representant responsable de la tache.
  representant_id uuid not null references representants(representant_id),
  -- Interaction qui a genere la tache.
  interaction_id uuid references interactions(interaction_id),
  -- Titre court de la tache.
  titre text not null,
  -- Description detaillee de la tache.
  description text,
  -- Date limite de traitement.
  date_echeance date,
  -- Statut courant de la tache.
  statut text not null default 'Ouverte',
  -- Date de creation technique.
  created_at timestamptz not null default now()
);
