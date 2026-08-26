# Capacité Hostinger pour la gestion documentaire

**Profil de référence :** KVM 4, 4 vCPU, 16 Go de RAM, 200 Go NVMe  
**Statut :** budget de capacité initial à confirmer par métriques

## Budget indicatif

| Service | RAM habituelle estimée | Profil CPU |
|---|---:|---|
| Ubuntu, Docker et Caddy | 0,5 à 1 Go | faible |
| PostgreSQL | 0,5 à 2 Go | faible à moyen |
| Keycloak | 0,7 à 1,5 Go | faible à moyen |
| n8n | 0,5 à 1,5 Go | variable |
| API CRM | 0,2 à 0,8 Go | faible |
| Worker OCR | 0,5 à 2 Go par tâche | élevé temporairement |
| ClamAV | 1 à 2,5 Go | moyen pendant l’analyse |
| MinIO local | 0,2 à 1 Go | faible |
| Ollama `mistral-nemo` chargé | environ 8 à 12 Go | très élevé sur CPU |

Ces valeurs ne sont pas des réservations garanties. Elles servent à définir les
limites initiales; `docker stats --no-stream` et les métriques applicatives font
autorité en exploitation.

## Conclusion de capacité

Le KVM 4 convient à une bêta si les traitements lourds sont séquentiels et si
les documents sont stockés hors du VPS. Ollama, OCR et ClamAV exécutés en même
temps peuvent dépasser les 16 Go. Une file limite donc le worker à une tâche
documentaire lourde et appelle Ollama seulement après échec ou ambiguïté des
extracteurs déterministes.

## Mesures obligatoires

- file persistante et concurrence initiale égale à 1;
- extraction directe des PDF textuels avant tout OCR;
- suppression automatique des fichiers temporaires;
- délais et limites mémoire/CPU des conteneurs;
- stockage objet et sauvegardes hors du VPS;
- alertes disque à 70 % et 85 %;
- suivi des durées antivirus, OCR et Ollama;
- ajout d’un swap de sécurité administré, sans le considérer comme de la RAM;
- réduction de la rétention des exécutions n8n.

## Capacité disque

Cent dossiers contenant chacun trente documents de 5 Mo avec deux versions
représentent environ 30 Go avant quarantaine, temporaires et sauvegardes. Les
200 Go suffisent à une bêta, mais ne doivent pas devenir l’unique copie des
documents.

## Critères d’évolution

Envisager un worker séparé ou un forfait supérieur lorsque l’une des conditions
suivantes persiste : mémoire supérieure à 80 %, file d’attente croissante,
plusieurs OCR simultanés nécessaires, latence interactive dégradée, disque au-
delà de 70 %, ou utilisation fréquente d’Ollama pendant les heures de pointe.

## Commandes d’observation

```bash
docker stats --no-stream
docker system df
free -h
df -h /
docker compose --env-file .env.production -f compose.yml ps
```
