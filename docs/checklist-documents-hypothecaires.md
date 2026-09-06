# Couverture de la checklist documentaire hypothécaire

**Source fonctionnelle :** checklist fournie le 2026-08-25  
**Statut :** analyse de l’existant et cible fonctionnelle

## Légende

- **Couvert** : données structurées et consultables dans le CRM.
- **Partiel** : résumé ou libellé de document disponible, sans cycle complet.
- **Absent** : aucune structure métier dédiée.
- **Cible** : fonctionnalité prévue dans l’API documentaire.

## Couverture actuelle

| Catégorie | Couverture actuelle | Statut | Cible |
|---|---|---|---|
| Identité et coordonnées | Nom, naissance, téléphone, courriel et adresse actuelle | Partiel | Deux pièces par participant, historique d’adresses, ménage et vérification |
| Codemandeurs et garants | `participants_dossier` avec identité et adresse | Partiel | Checklist et fichiers propres à chaque participant |
| Autorisation de crédit | Consentement versionné, accepté/retiré et référence de preuve | Partiel | Type contrôlé, artefact signé, expiration et audit |
| Emploi et revenu | Type d’emploi, employeur et revenu annuel | Partiel | Historique d’emploi et sources de revenus structurées |
| Preuves salariales | Libellé libre dans `documents_requis` | Partiel | Lettre, talons, T4/RL-1 et avis par année/période |
| Travailleur autonome | Notes ou extraction de transcription | Absent | T1/T2125, avis, T2, états financiers, NEQ et relevés commerciaux |
| Autres revenus | Notes libres possibles | Absent | Revenus locatifs, pensions, prestations et placements normalisés |
| Dettes | Total global | Partiel | Passifs individuels, solde, paiement et justificatifs |
| Actifs | Aucun inventaire | Absent | Comptes, REER/CELI/CELIAPP et autres actifs |
| Mise de fonds | Montant et provenance | Partiel | Sources multiples, traçabilité 90 jours, don, RAP et CELIAPP |
| Propriété | Type, occupation, prix, valeur et montant requis | Partiel | Propriété structurée, taxes, offre et conditions |
| Copropriété | Aucun modèle propre | Absent | Règles condo et documents du syndicat |
| Évaluation | Exigence, statut, évaluateur, date et valeur | Couvert pour le suivi | Rapport lié à la checklist et validation |
| Assurance | Exigence, assureur, statut et prime | Partiel | Police/soumission téléversée et validée |
| Notaire et clôture | Notaire, instructions, fermeture et décaissement | Couvert pour le suivi | Liquidités et frais détaillés avec justificatifs |
| Mandat et construction | Étape du parcours ou notes | Partiel | Mandat signé et règles propres aux constructions neuves |

## Limite de la table actuelle

`documents_requis` conserve uniquement le client, le représentant, un libellé,
un statut et la date de demande. Elle sert à afficher les documents manquants,
mais ne contient ni fichier, catégorie contrôlée, participant, période, version,
expiration, contrôle antivirus, extraction, validation ou motif de refus.

La table reste utilisable pendant la transition. Une migration doit créer la
nouvelle checklist à partir des libellés existants sans supprimer les données.

## Règles conditionnelles minimales

| Condition | Documents ajoutés |
|---|---|
| Salarié | Lettre d’emploi, talons récents, T4/RL-1 et avis de cotisation |
| Travailleur autonome | T1/T2125, avis, preuve d’impôts payés, états financiers et relevés commerciaux |
| Revenu locatif | Baux et déclarations correspondantes |
| Don familial | Lettre de don, transfert et preuve des fonds du donateur |
| RAP ou CELIAPP | Formulaire et preuve de retrait admissible |
| Fonds étrangers | Transfert et traçabilité bancaire |
| Condo | Déclaration, budget, états financiers, procès-verbaux, fonds et assurance |
| Offre acceptée | Promesse d’achat, annexes, déclaration du vendeur, localisation, MLS et taxes |
| Nouvelle construction | Contrat, bon de commande et garanties |
| Mise de fonds sous le seuil configuré | Exigences de l’assureur hypothécaire |

Ces règles sont déterministes et versionnées. L’IA peut reconnaître une
condition dans le dialogue, mais une donnée confirmée doit alimenter la règle
avant de modifier la checklist.

## Portes documentaires du parcours

- Étape 2 : identité, consentement, revenus, dettes, actifs et mise de fonds.
- Étape 3 : dossier minimal de préqualification et lettre obtenue.
- Étape 5 : promesse d’achat et renseignements de propriété.
- Étape 6 : toutes les exigences de soumission acceptées ou dérogées.
- Étape 8 : conditions du prêteur, évaluation et assurance satisfaites.
- Étape 9 : police d’assurance et exigences du notaire complètes.
- Étape 10 : signature et décaissement confirmés.

Une porte bloquante doit afficher les éléments manquants et permettre seulement
à un rôle autorisé d’accorder une dérogation motivée et auditée.
