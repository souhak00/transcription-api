-- Ajoute un type controle pour distinguer les profils d'acces applicatifs.
do $$
begin
  -- Cree le type seulement s'il n'existe pas deja.
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'representant', 'client');
  end if;
end
$$;

-- Stocke les utilisateurs qui pourront se connecter au futur portail ou a l'API CRM.
create table if not exists app_users (
  -- Identifiant technique unique de l'utilisateur applicatif.
  user_id uuid primary key default gen_random_uuid(),
  -- Courriel de connexion de l'utilisateur.
  courriel text unique not null,
  -- Role applicatif qui controle les droits d'acces.
  role user_role not null,
  -- Indique si le compte utilisateur est actif.
  actif boolean not null default true,
  -- Date de creation du compte.
  created_at timestamptz not null default now(),
  -- Date de derniere mise a jour du compte.
  updated_at timestamptz not null default now()
);

-- Rattache chaque representant a un utilisateur applicatif optionnel.
alter table representants
add column if not exists user_id uuid references app_users(user_id);

-- Rattache chaque client a un utilisateur applicatif optionnel.
alter table clients
add column if not exists user_id uuid references app_users(user_id);

-- Evite qu'un meme compte utilisateur soit rattache a plusieurs representants.
create unique index if not exists ux_representants_user_id
on representants (user_id)
where user_id is not null;

-- Evite qu'un meme compte utilisateur soit rattache a plusieurs clients.
create unique index if not exists ux_clients_user_id
on clients (user_id)
where user_id is not null;

-- Index utile pour filtrer rapidement les clients visibles par representant.
create index if not exists ix_clients_representant_id
on clients (representant_id);

-- Index utile pour filtrer rapidement les interactions visibles par client.
create index if not exists ix_interactions_client_id
on interactions (client_id);

-- Index utile pour filtrer rapidement les interactions visibles par representant.
create index if not exists ix_interactions_representant_id
on interactions (representant_id);

-- Active la securite par ligne sur les tables sensibles.
alter table clients enable row level security;
alter table interactions enable row level security;
alter table documents_requis enable row level security;
alter table taches enable row level security;

-- Force aussi le proprietaire des tables a respecter les politiques RLS.
alter table clients force row level security;
alter table interactions force row level security;
alter table documents_requis force row level security;
alter table taches force row level security;

-- Supprime les anciennes politiques si la migration est rejouee.
drop policy if exists clients_access_policy on clients;
drop policy if exists interactions_access_policy on interactions;
drop policy if exists documents_requis_access_policy on documents_requis;
drop policy if exists taches_access_policy on taches;

-- Controle l'acces a la table clients.
create policy clients_access_policy on clients
using (
  -- Un administrateur applicatif peut voir tous les clients.
  current_setting('app.role', true) = 'admin'
  -- Un representant voit seulement les clients rattaches a son representant_id.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
  -- Un client voit seulement sa propre fiche client.
  or (
    current_setting('app.role', true) = 'client'
    and client_id::text = current_setting('app.client_id', true)
  )
)
with check (
  -- Un administrateur applicatif peut creer ou modifier tous les clients.
  current_setting('app.role', true) = 'admin'
  -- Un representant peut creer ou modifier seulement ses propres clients.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
);

-- Controle l'acces a l'historique des interactions.
create policy interactions_access_policy on interactions
using (
  -- Un administrateur applicatif peut voir toutes les interactions.
  current_setting('app.role', true) = 'admin'
  -- Un representant voit seulement les interactions de son portefeuille.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
  -- Un client voit seulement ses propres interactions.
  or (
    current_setting('app.role', true) = 'client'
    and client_id::text = current_setting('app.client_id', true)
  )
)
with check (
  -- Un administrateur applicatif peut creer ou modifier toutes les interactions.
  current_setting('app.role', true) = 'admin'
  -- Un representant peut creer ou modifier seulement les interactions de son portefeuille.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
);

-- Controle l'acces aux documents requis.
create policy documents_requis_access_policy on documents_requis
using (
  -- Un administrateur applicatif peut voir tous les documents requis.
  current_setting('app.role', true) = 'admin'
  -- Un representant voit seulement les documents de son portefeuille.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
  -- Un client voit seulement les documents rattaches a sa fiche client.
  or (
    current_setting('app.role', true) = 'client'
    and client_id::text = current_setting('app.client_id', true)
  )
)
with check (
  -- Un administrateur applicatif peut creer ou modifier tous les documents requis.
  current_setting('app.role', true) = 'admin'
  -- Un representant peut creer ou modifier seulement les documents de son portefeuille.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
);

-- Controle l'acces aux taches.
create policy taches_access_policy on taches
using (
  -- Un administrateur applicatif peut voir toutes les taches.
  current_setting('app.role', true) = 'admin'
  -- Un representant voit seulement les taches de son portefeuille.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
  -- Un client voit seulement les taches rattachees a sa fiche client.
  or (
    current_setting('app.role', true) = 'client'
    and client_id::text = current_setting('app.client_id', true)
  )
)
with check (
  -- Un administrateur applicatif peut creer ou modifier toutes les taches.
  current_setting('app.role', true) = 'admin'
  -- Un representant peut creer ou modifier seulement les taches de son portefeuille.
  or (
    current_setting('app.role', true) = 'representant'
    and representant_id::text = current_setting('app.representant_id', true)
  )
);
