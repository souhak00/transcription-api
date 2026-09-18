# ADR-006 — API documentaire et OCR découplé de l’IA

**Date :** 2026-08-25  
**Statut :** accepté pour l’architecture cible

## Contexte

La table `documents_requis` permet le suivi d’un libellé et d’un statut, mais ne
gère ni fichier, version, contrôle de sécurité, extraction ni validation. Le CRM
doit couvrir une checklist variable selon le profil, le prêteur et la propriété,
sans transformer Ollama ou n8n en autorité métier.

## Décision

Développer un module d’API documentaire dans le backend Node.js existant avant
d’envisager un microservice séparé. Le module dispose de tables, routes et
workers dédiés, utilise un stockage objet privé et publie des événements vers
n8n. L’OCR repose sur l’extraction PDF et OCRmyPDF/Tesseract. Ollama reste
facultatif pour la classification et le texte libre.

Le moteur de checklist est déterministe et versionné. Toutes les données
extraites restent candidates jusqu’à validation humaine.

## Conséquences positives

- fonctionnement de l’OCR même lorsque le modèle IA est indisponible;
- décisions reproductibles, testables et explicables;
- séparation des fichiers et des données relationnelles;
- réutilisation de Keycloak, PostgreSQL, RLS et du déploiement Node actuel;
- possibilité de séparer le worker plus tard sans changer le contrat Web.

## Contraintes

- ajout d’un stockage objet, d’un antivirus et d’une file persistante;
- besoin d’une politique de conservation et d’un audit documentaire;
- consommation CPU temporaire de l’OCR;
- validation humaine obligatoire avant écriture des champs officiels.

## Alternatives rejetées

- OCR effectué par Ollama : dépendance lourde, résultat moins déterministe et
  modèle textuel actuel inadapté à la lecture directe d’images.
- fichiers dans PostgreSQL : sauvegardes et montée en charge plus difficiles.
- logique de checklist dans n8n : versionnement, tests et audit insuffisamment
  centralisés.
- microservice immédiat : coût opérationnel prématuré pour le volume bêta.
