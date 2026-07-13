# POC CRM hypothecaire avec n8n, Ollama et Google Sheets

Ce document decrit l'evolution cible du workflow existant.

La feuille de route complete par phases est disponible dans [ROADMAP_ASSISTANT_HYPOTHECAIRE.md](./ROADMAP_ASSISTANT_HYPOTHECAIRE.md).

Workflow actuel:

```text
Audio Google Drive
-> API transcription locale
-> transcription originale
-> synthese IA
-> sauvegarde Drive
-> courriel Gmail
```

Workflow cible:

```text
Audio
-> transcription
-> extraction IA JSON
-> identification representant
-> recherche client existant
-> creation ou mise a jour client
-> creation interaction
-> documents requis
-> taches de suivi
-> fiche/synthese
-> courriel
```

## 1. Valeur d'affaires

La transcription seule est utile, mais la valeur principale pour un conseiller hypothecaire est:

- eviter la saisie manuelle;
- structurer automatiquement les donnees client;
- detecter le type de dossier;
- identifier les documents manquants;
- creer des taches de suivi;
- rattacher chaque client au bon representant;
- conserver l'historique des interactions.

## 2. Option POC recommandee: Google Sheets

Pour un POC rapide avec Hugo ou une petite equipe, Google Sheets est recommande.

Avantages:

- rapide a mettre en place;
- visible par les utilisateurs;
- compatible n8n;
- suffisant pour valider le besoin d'affaires.

Limites:

- moins robuste qu'une vraie base de donnees;
- risque de lenteur si le volume augmente;
- controle transactionnel limite.

## 3. Option durable: PostgreSQL

PostgreSQL devient preferable si:

- plusieurs representants utilisent la solution;
- le volume augmente;
- on veut des recherches rapides;
- on veut une securite et une gouvernance plus fortes;
- le POC devient une application durable.

Dans cette solution, PostgreSQL est execute dans un conteneur Docker nomme:

```text
postgres-crm
```

La configuration est dans:

```text
docker-compose.yml
```

La base est persistante grace au volume Docker:

```text
postgres_data
```

Au premier demarrage, Docker execute automatiquement:

```text
database/001_crm_postgresql.sql
```

Resultat attendu:

```text
La base transcription_crm contient les tables representants, clients, interactions, documents_requis et taches.
```

## 4. Tables minimales

### Table `representants`

| Champ | Exemple | Description |
| --- | --- | --- |
| `representant_id` | `UUID` | Identifiant technique interne du representant |
| `user_id` | `UUID` | Compte applicatif rattache au representant |
| `code_representant` | `2026999999` | Identifiant metier visible, 10 chiffres, commence par l'annee |
| `nom_representant` | `Hugo Tremblay` | Nom complet |
| `courriel` | `hugo@email.com` | Courriel professionnel |
| `telephone` | `514-000-0000` | Telephone |
| `equipe` | `Hypothecaire` | Equipe ou departement |
| `actif` | `TRUE` | Permet de desactiver un representant |

### Table `app_users`

| Champ | Exemple | Description |
| --- | --- | --- |
| `user_id` | `UUID` | Identifiant unique du compte applicatif |
| `courriel` | `client@email.com` | Courriel de connexion |
| `role` | `client` | `admin`, `representant` ou `client` |
| `actif` | `TRUE` | Permet de desactiver l'acces |

### Table `clients`

| Champ | Exemple | Description |
| --- | --- | --- |
| `client_id` | `CLI-0001` | Identifiant unique client |
| `user_id` | `UUID` | Compte applicatif rattache au client |
| `representant_id` | `UUID` | Representant responsable, cle technique interne |
| `nom_client` | `Jean Tremblay` | Nom du client |
| `telephone` | `514-111-1111` | Telephone principal |
| `courriel` | `jean@email.com` | Courriel principal |
| `type_emploi` | `Salarie` | Salarie, autonome, retraite, etc. |
| `employeur` | `Hydro-Quebec` | Employeur |
| `revenu_annuel` | `85000` | Revenu annuel |
| `revenu_conjoint` | `65000` | Revenu du conjoint si mentionne |
| `type_transaction` | `Refinancement` | Type de dossier detecte |
| `prix_achat` | `525000` | Prix d'achat si applicable |
| `valeur_propriete` | `600000` | Valeur estimee |
| `solde_hypothecaire` | `350000` | Solde hypothecaire |
| `montant_financement` | `450000` | Montant demande |
| `mise_de_fonds` | `75000` | Mise de fonds |
| `provenance_mise_de_fonds` | `Epargne personnelle` | Source des fonds |
| `dettes_totales` | `25000` | Dettes totales mentionnees |
| `informations_fiscales` | `Avis de cotisation requis` | Informations fiscales pertinentes |
| `statut_dossier` | `A valider` | Nouveau, A valider, En cours, Ferme |
| `date_rappel` | `2026-06-08` | Date de suivi |
| `date_creation` | `2026-06-05` | Date de creation |
| `date_mise_a_jour` | `2026-06-05` | Derniere mise a jour |

### Table `interactions`

| Champ | Exemple | Description |
| --- | --- | --- |
| `interaction_id` | `INT-0001` | Identifiant unique interaction |
| `client_id` | `CLI-0001` | Client concerne |
| `representant_id` | `REP-001` | Representant concerne |
| `date_appel` | `2026-06-05` | Date de l'appel |
| `type_interaction` | `Appel entrant` | Appel, courriel, suivi, etc. |
| `transcription_originale_url` | `lien Drive` | Lien vers transcription brute |
| `synthese_url` | `lien Drive` | Lien vers synthese IA |
| `fiche_json` | `{...}` | JSON extrait par Ollama |
| `resume` | `Client souhaite...` | Resume court |
| `niveau_confiance` | `moyen` | faible, moyen, eleve |

### Table `documents_requis`

| Champ | Exemple | Description |
| --- | --- | --- |
| `document_id` | `DOC-0001` | Identifiant document |
| `client_id` | `CLI-0001` | Client concerne |
| `interaction_id` | `INT-0001` | Interaction source |
| `representant_id` | `REP-001` | Representant responsable |
| `document` | `Avis de cotisation` | Document requis |
| `statut` | `A recevoir` | A recevoir, Recu, Valide |
| `date_demande` | `2026-06-05` | Date de demande |

### Table `taches`

| Champ | Exemple | Description |
| --- | --- | --- |
| `tache_id` | `TCH-0001` | Identifiant tache |
| `client_id` | `CLI-0001` | Client concerne |
| `representant_id` | `REP-001` | Responsable |
| `interaction_id` | `INT-0001` | Interaction source |
| `titre` | `Attendre avis de cotisation` | Titre court |
| `description` | `Le client doit envoyer son avis de cotisation.` | Detail |
| `date_echeance` | `2026-06-08` | Date de rappel |
| `statut` | `Ouverte` | Ouverte, En cours, Completee |

## 4.1 Modele de securite et d'acces

Important:

```text
representant_id est une cle technique interne de type UUID.
code_representant est l'identifiant metier visible par les utilisateurs.
```

Exemple:

```text
representant_id   = e.g. 7f3f9f3a-...
code_representant = 2026999999
```

Le code representant doit respecter le format:

```text
10 chiffres
les 4 premiers chiffres representent l'annee
exemple: 2026999999
```

La base doit isoler les donnees selon le type d'utilisateur.

Roles:

```text
admin          : acces complet pour l'administration technique.
representant  : acces seulement aux clients et appels de son portefeuille.
client         : acces seulement a sa propre fiche et a ses propres interactions.
```

Regles d'acces:

```text
Un representant ne peut pas consulter les clients d'un autre representant.
Un client ne peut pas consulter les donnees d'un representant.
Un client ne peut pas consulter les donnees d'un autre client.
```

Modele de rattachement:

```text
app_users.user_id
  -> representants.user_id pour un compte representant
  -> clients.user_id pour un compte client
```

Les tables metier restent rattachees au representant et au client:

```text
clients.representant_id
interactions.representant_id
interactions.client_id
documents_requis.representant_id
documents_requis.client_id
taches.representant_id
taches.client_id
```

Protection technique:

```text
PostgreSQL Row Level Security est active sur:
- clients
- interactions
- documents_requis
- taches
```

Migration:

```text
database/002_access_control.sql
```

Principe d'utilisation:

Avant une requete SQL provenant d'une API ou d'un portail, l'application doit definir le contexte de l'utilisateur connecte.

Pour un representant:

```sql
select set_config('app.role', 'representant', true);
select set_config('app.representant_id', 'UUID_DU_REPRESENTANT', true);
```

Pour un client:

```sql
select set_config('app.role', 'client', true);
select set_config('app.client_id', 'UUID_DU_CLIENT', true);
```

Pour n8n, le workflow de traitement automatique peut utiliser un acces `admin` ou `representant` selon le contexte du dossier traite.

## 5. Regle de dedoublonnage

La recherche de doublon doit etre faite par representant.

Regles:

```text
representant_id + telephone
```

ou:

```text
representant_id + courriel
```

Cela evite de melanger deux clients similaires geres par deux representants differents.

Ordre recommande:

```text
1. Si telephone est present:
   rechercher client par representant_id + telephone.
2. Si aucun client n'est trouve et courriel est present:
   rechercher client par representant_id + courriel.
3. Si un client est trouve:
   mettre a jour sa fiche.
4. Si aucun client n'est trouve:
   creer une nouvelle fiche client.
5. Dans tous les cas:
   creer une nouvelle interaction d'appel.
```

Regle de prudence:

```text
Ne pas dedoublonner uniquement par nom_client.
```

Deux clients peuvent avoir le meme nom, ou l'IA peut mal reconnaitre un nom. Si le telephone et le courriel sont absents, creer un dossier avec le statut `A valider` et ajouter `telephone` et `courriel` dans les points a valider.

## 5.1 Contraintes PostgreSQL recommandees

Le script SQL de reference est disponible dans:

```text
database/001_crm_postgresql.sql
```

Il cree notamment deux index uniques partiels:

```sql
create unique index if not exists ux_clients_representant_telephone
on clients (representant_id, telephone)
where telephone is not null and btrim(telephone) <> '';

create unique index if not exists ux_clients_representant_courriel
on clients (representant_id, lower(courriel))
where courriel is not null and btrim(courriel) <> '';
```

Ces contraintes protegent la base meme si le workflow n8n est execute deux fois avec le meme appel.

## 6. Logique n8n cible

```text
1. Declenchement
2. Identifier le representant
3. Telecharger l'audio
4. Transcrire l'appel
5. Extraire les donnees client au format JSON
6. Parser le JSON
7. Rechercher client existant:
   - representant_id + telephone
   - sinon representant_id + courriel
8. Si client trouve:
   - mettre a jour client
9. Si client absent:
   - creer client
10. Creer interaction
11. Creer documents requis
12. Creer taches de suivi
13. Generer fichiers Drive
14. Envoyer courriel au representant
```

## 6.1 Logique n8n detaillee pour PostgreSQL

Ajouter ces noeuds apres `Parse JSON client`.

Parametres de connexion PostgreSQL dans n8n:

```text
Host si n8n est local sur Windows: host.docker.internal
Host si n8n est dans le meme docker-compose: postgres-crm
Port: 5432
Database: transcription_crm
User: transcription_user
Password: transcription_password
SSL: desactive en local
```

Test de validation:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Resultat attendu:

```text
clients
documents_requis
interactions
representants
taches
```

### Noeud `Postgres - Rechercher client telephone`

Objectif: trouver une fiche existante avec le telephone.

```sql
select *
from clients
where representant_id = $1
  and telephone = $2
limit 1;
```

Parametres:

```text
$1 = representant_id
$2 = telephone
```

Resultat attendu:

```text
0 item si aucun client trouve
1 item si client trouve
```

### Noeud `IF - Client trouve par telephone`

Condition:

```text
Nombre d'items > 0
```

Si vrai:

```text
Postgres - Mettre a jour client
```

Si faux:

```text
Postgres - Rechercher client courriel
```

### Noeud `Postgres - Rechercher client courriel`

Objectif: trouver une fiche existante avec le courriel si le telephone n'a rien donne.

```sql
select *
from clients
where representant_id = $1
  and lower(courriel) = lower($2)
limit 1;
```

Parametres:

```text
$1 = representant_id
$2 = courriel
```

### Noeud `IF - Client trouve par courriel`

Si vrai:

```text
Postgres - Mettre a jour client
```

Si faux:

```text
Postgres - Creer client
```

### Noeud `Postgres - Mettre a jour client`

Objectif: enrichir la fiche existante sans perdre l'historique.

```sql
update clients
set
  nom_client = coalesce($2, nom_client),
  telephone = coalesce($3, telephone),
  courriel = coalesce($4, courriel),
  type_emploi = coalesce($5, type_emploi),
  employeur = coalesce($6, employeur),
  revenu_annuel = coalesce($7, revenu_annuel),
  revenu_conjoint = coalesce($8, revenu_conjoint),
  type_transaction = coalesce($9, type_transaction),
  prix_achat = coalesce($10, prix_achat),
  valeur_propriete = coalesce($11, valeur_propriete),
  solde_hypothecaire = coalesce($12, solde_hypothecaire),
  montant_financement = coalesce($13, montant_financement),
  mise_de_fonds = coalesce($14, mise_de_fonds),
  provenance_mise_de_fonds = coalesce($15, provenance_mise_de_fonds),
  dettes_totales = coalesce($16, dettes_totales),
  objectif = coalesce($17, objectif),
  date_rappel = coalesce($18, date_rappel),
  informations_fiscales = coalesce($19, informations_fiscales),
  niveau_confiance = coalesce($20, niveau_confiance),
  resume = coalesce($21, resume),
  statut_dossier = 'A valider',
  updated_at = now()
where client_id = $1
returning *;
```

### Noeud `Postgres - Creer client`

Objectif: creer une nouvelle fiche seulement quand la recherche telephone/courriel ne trouve rien.

```sql
insert into clients (
  representant_id,
  nom_client,
  telephone,
  courriel,
  type_emploi,
  employeur,
  revenu_annuel,
  revenu_conjoint,
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
  informations_fiscales,
  statut_dossier,
  niveau_confiance,
  resume
)
values (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
  $13, $14, $15, $16, $17, $18, $19, 'Nouveau', $20, $21
)
returning *;
```

### Noeud `Postgres - Creer interaction`

Objectif: garder une ligne d'historique pour chaque appel, meme si le client existait deja.

```sql
insert into interactions (
  client_id,
  representant_id,
  fichier_original_nom,
  transcription_originale_url,
  synthese_url,
  fiche_json,
  resume,
  niveau_confiance
)
values (
  $1, $2, $3, $4, $5, $6::jsonb, $7, $8
)
returning *;
```

Resultat attendu:

```text
Un client unique par representant + telephone ou representant + courriel.
Une interaction creee a chaque appel traite.
```

## 7. Identification du representant

Options possibles:

### Option A - Dossier Google Drive par representant

Chaque representant depose ses audios dans son propre dossier.

Exemple:

```text
Drive/Hugo Tremblay/Appels
Drive/Sarah Roy/Appels
```

n8n mappe le dossier source vers:

```text
REP-001
```

### Option B - Nom du fichier

Le fichier contient le representant:

```text
REP-001_2026-06-05_appel-client.m4a
```

### Option C - Champ manuel dans n8n

Pour le POC, on peut fixer:

```text
representant_id = REP-001
```

## 8. Prompt Ollama pour JSON client strict

Utiliser ce prompt dans le noeud Ollama d'extraction, distinct du noeud de synthese.

```text
Tu es un assistant d'extraction de donnees pour un conseiller hypothecaire au Canada.

A partir de la transcription suivante, extrais les informations client au format JSON strict.

Retourne uniquement un JSON valide.
Ne retourne aucun texte avant ou apres le JSON.
N'utilise pas de Markdown.
N'invente aucune information.
Si une information est absente, mets null.
Si une information est incertaine, mets "A valider".

Structure attendue:
{
  "nom_client": null,
  "telephone": null,
  "courriel": null,
  "type_emploi": null,
  "employeur": null,
  "revenu_annuel": null,
  "revenu_conjoint": null,
  "type_transaction": null,
  "prix_achat": null,
  "valeur_propriete": null,
  "solde_hypothecaire": null,
  "montant_financement": null,
  "mise_de_fonds": null,
  "provenance_mise_de_fonds": null,
  "dettes_totales": null,
  "objectif": null,
  "date_rappel": null,
  "informations_fiscales": null,
  "documents_requis": [],
  "points_a_valider": [],
  "prochaines_actions": [],
  "niveau_confiance": null,
  "resume": null
}

Types de transaction possibles:
- Refinancement
- Renouvellement
- Achat
- Consolidation de dettes
- Investissement locatif
- Marge de credit
- Autre
- A valider

Transcription:
{{transcription}}
```

## 9. Body n8n pour Ollama extraction JSON

Dans le noeud HTTP Request vers Ollama:

```javascript
={{
  {
    "model": "llama3.2:latest",
    "stream": false,
    "format": "json",
    "prompt":
      "Tu es un assistant d'extraction de donnees pour un conseiller hypothecaire au Canada.\n\n" +
      "A partir de la transcription suivante, extrais les informations client au format JSON strict.\n\n" +
      "Retourne uniquement un JSON valide. Ne retourne aucun texte avant ou apres le JSON. N'utilise pas de Markdown. N'invente aucune information. Si une information est absente, mets null. Si une information est incertaine, mets \"A valider\".\n\n" +
      "Structure attendue:\n" +
      "{\n" +
      "  \"nom_client\": null,\n" +
      "  \"telephone\": null,\n" +
      "  \"courriel\": null,\n" +
      "  \"type_emploi\": null,\n" +
      "  \"employeur\": null,\n" +
      "  \"revenu_annuel\": null,\n" +
      "  \"revenu_conjoint\": null,\n" +
      "  \"type_transaction\": null,\n" +
      "  \"prix_achat\": null,\n" +
      "  \"valeur_propriete\": null,\n" +
      "  \"solde_hypothecaire\": null,\n" +
      "  \"montant_financement\": null,\n" +
      "  \"mise_de_fonds\": null,\n" +
      "  \"provenance_mise_de_fonds\": null,\n" +
      "  \"dettes_totales\": null,\n" +
      "  \"objectif\": null,\n" +
      "  \"date_rappel\": null,\n" +
      "  \"informations_fiscales\": null,\n" +
      "  \"documents_requis\": [],\n" +
      "  \"points_a_valider\": [],\n" +
      "  \"prochaines_actions\": [],\n" +
      "  \"niveau_confiance\": null,\n" +
      "  \"resume\": null\n" +
      "}\n\n" +
      "Transcription:\n" +
      $json.transcript
  }
}}
```

## 10. Prochaine evolution du workflow n8n

Ajouter ces noeuds apres `API - Transcription`:

```text
API - Transcription
-> Ollama - Extraction JSON client
-> Parse JSON extraction
-> Google Sheets - Lookup client
-> IF client existe?
   -> Update client
   -> Create interaction
-> Else
   -> Create client
   -> Create interaction
-> Create documents requis
-> Create taches
```
