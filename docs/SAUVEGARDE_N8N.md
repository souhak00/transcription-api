# Sauvegarde et restauration n8n

> Cette procédure sauvegarde n8n, ses workflows et ses credentials. Elle ne
> sauvegarde pas les futurs fichiers hypothécaires. Ceux-ci seront conservés
> dans un stockage objet privé avec une politique séparée décrite dans
> [`gestion-documentaire-ocr.md`](./gestion-documentaire-ocr.md). PostgreSQL,
> Keycloak et le stockage objet exigent chacun leur propre sauvegarde.

La sauvegarde n8n utilise deux niveaux complémentaires.

## 1. Workflows versionnés dans Git

Le dossier `n8n-workflows/workspace-export` contient l'export complet des workflows du workspace. Il peut être relu, comparé et restauré sans exposer les credentials.

Pour importer tous les workflows dans un conteneur n8n :

```powershell
docker cp n8n-workflows/workspace-export/. N8N_Local:/tmp/workspace-export/
docker exec N8N_Local n8n import:workflow --separate --input=/tmp/workspace-export
```

Vérifier les workflows dans l'interface avant toute activation. Une importation peut créer des doublons si les mêmes identifiants existent déjà.

## 2. Sauvegarde locale complète et sensible

Le dossier local `backups/n8n/<horodatage>` est exclu de Git. Il contient :

- l'archive complète `n8n-volume.tar` du volume Docker `n8n_data`;
- les workflows exportés séparément;
- les credentials exportés sous forme chiffrée;
- un manifeste avec la taille et l'empreinte SHA-256.

L'archive du volume inclut notamment `config`, `database.sqlite` et `storage`. Le fichier `config` est indispensable, car il contient la clé utilisée par cette instance pour déchiffrer ses credentials.

## Restauration complète

1. Arrêter le conteneur n8n.
2. Créer un nouveau volume Docker vide destiné à n8n.
3. Extraire `n8n-volume.tar` à la racine de ce volume.
4. Monter ce volume sur `/home/node/.n8n` avec une version n8n compatible.
5. Démarrer n8n et vérifier les workflows, les credentials et les exécutions.

Exemple pour un volume nommé `n8n_data_restore` :

```powershell
docker volume create n8n_data_restore
docker run --rm --entrypoint sh -v "n8n_data_restore:/restore" -v "C:\chemin\vers\la\sauvegarde:/backup:ro" docker.n8n.io/n8nio/n8n:2.30.4 -c "cd /restore; tar -xf /backup/n8n-volume.tar"
```

Ne jamais publier l'archive complète, le fichier `config` ou les exports de credentials dans GitHub. Conserver au moins une copie chiffrée sur un support distinct de l'ordinateur qui exécute n8n.
