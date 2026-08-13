# Déploiement de production sur Hostinger

Cette configuration déploie l’interface CRM et son API, PostgreSQL, Keycloak, n8n, Ollama et Caddy sur un VPS Docker.

## Exposition réseau

Seuls Caddy et les ports `80/443` sont publiés. PostgreSQL, Ollama, l’API, Keycloak et n8n communiquent sur les réseaux Docker privés.

- `https://crm.toniaconseil.com` : interface et API CRM;
- `https://auth.toniaconseil.com` : endpoints publics Keycloak;
- `https://n8n.toniaconseil.com` : interface n8n protégée par une authentification HTTP additionnelle.

L’administration Web Keycloak (`/admin`) est bloquée par Caddy. Les opérations administratives se font depuis le VPS avec `kcadm.sh` ou temporairement avec une règle d’accès explicitement contrôlée.

## 1. Installer le dépôt

Depuis une session `deploycrm` :

```bash
cd /opt
sudo git clone --branch feature/reprise-travaux-crm https://github.com/souhak00/transcription-api.git crm-hypothecaire
sudo chown -R deploycrm:deploycrm /opt/crm-hypothecaire
cd /opt/crm-hypothecaire/deploy/production
```

## 2. Créer les secrets

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Générer chaque secret séparément :

```bash
openssl rand -base64 48
```

Pour le mot de passe additionnel de n8n :

```bash
docker run --rm -it caddy:2.10.2-alpine caddy hash-password
```

Copier uniquement le hash bcrypt dans `N8N_PROXY_PASSWORD_HASH`. Comme les hashes bcrypt contiennent des caractères `$`, entourer la valeur de guillemets simples dans le fichier :

```text
N8N_PROXY_PASSWORD_HASH='$2a$...'
```

Ne jamais ajouter `.env.production` à Git.

## 3. Valider et construire

Toutes les commandes Compose doivent inclure le fichier d’environnement :

```bash
docker compose --env-file .env.production -f compose.yml config --quiet
docker compose --env-file .env.production -f compose.yml build postgres-crm keycloak transcription-api
```

## 4. Démarrage initial

```bash
mkdir -p runtime/migration
docker compose --env-file .env.production -f compose.yml up -d postgres-crm ollama
docker compose --env-file .env.production -f compose.yml ps
```

Le premier démarrage de PostgreSQL crée deux bases séparées : `transcription_crm` et `keycloak`. Il crée aussi les comptes minimaux `crm_runtime` et `keycloak_app` avec les secrets fournis hors dépôt.

### Restaurer les données CRM

Placer `crm-production-data.dump` dans `runtime/migration`, puis exécuter :

```bash
docker compose --env-file .env.production -f compose.yml exec -T postgres-crm sh -c 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --data-only --no-owner --no-acl --disable-triggers /migration/crm-production-data.dump'
```

### Restaurer Keycloak

Placer l’export complet `keycloak-realm-production.json` dans `runtime/migration` avant le premier démarrage de Keycloak. Dans `.env.production`, utiliser :

```text
KEYCLOAK_REALM_IMPORT_PATH=./runtime/migration/keycloak-realm-production.json
```

Cet export contient les utilisateurs, les rôles, les attributs `representant_id`, les clients OIDC et des données d’authentification. Il doit rester hors Git et être traité comme un secret.

### Restaurer n8n

Placer `n8n-volume.tar` dans `runtime/migration`, puis restaurer le volume avant le premier démarrage de n8n :

```bash
docker volume create crm-hypothecaire_n8n_data
docker run --rm -v crm-hypothecaire_n8n_data:/restore -v "$PWD/runtime/migration:/backup:ro" alpine:3.22 sh -c 'cd /restore && tar -xf /backup/n8n-volume.tar'
```

Vérifier que le volume contient `config` et `database.sqlite` :

```bash
docker run --rm -v crm-hypothecaire_n8n_data:/data:ro alpine:3.22 sh -c 'test -f /data/config && test -f /data/database.sqlite && echo "Sauvegarde n8n valide"'
```

Après la restauration des données CRM et du volume n8n :

```bash
docker compose --env-file .env.production -f compose.yml up -d keycloak n8n transcription-api caddy
docker compose --env-file .env.production -f compose.yml ps
```

## 5. Télécharger le modèle Ollama

```bash
docker compose --env-file .env.production -f compose.yml exec ollama ollama pull mistral-nemo
```

Le téléchargement est volumineux et l’inférence est exécutée sur CPU sur un VPS KVM standard.

## 6. Ajustements n8n après restauration

Dans n8n, vérifier les deux credentials restaurés :

- `Postgres CRM Runtime` : hôte `postgres-crm`, port `5432`, base `transcription_crm`, utilisateur `crm_runtime` et valeur de `CRM_RUNTIME_PASSWORD`;
- `Ollama account` : URL de base `http://ollama:11434`.

Ne jamais exposer directement les ports `5432`, `5678`, `8080` ou `11434` sur le VPS.

## 7. Vérifications

```bash
curl --fail https://crm.toniaconseil.com/health
curl --fail https://auth.toniaconseil.com/realms/crm-local/.well-known/openid-configuration
docker compose --env-file .env.production -f compose.yml logs --tail=100
```

Tester ensuite la connexion d’un représentant et d’un administrateur, puis confirmer qu’un représentant ne peut consulter que ses propres clients.

## Exploitation

```bash
docker compose --env-file .env.production -f compose.yml ps
docker compose --env-file .env.production -f compose.yml logs -f --tail=100
docker compose --env-file .env.production -f compose.yml pull
docker compose --env-file .env.production -f compose.yml up -d --build
```

Avant toute mise à jour, effectuer une sauvegarde PostgreSQL et n8n. Ne pas utiliser `docker compose down -v`, car l’option `-v` supprimerait les volumes de données.
