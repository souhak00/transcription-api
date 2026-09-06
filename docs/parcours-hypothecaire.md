# Parcours hypothécaire

Le CRM suit un dossier dans un parcours normalisé de 11 étapes. Chaque dossier possède sa propre copie du suivi, isolée par représentant avec les politiques RLS PostgreSQL.

| # | Code | Étape | Responsable par défaut | Critère de sortie principal |
|---:|---|---|---|---|
| 1 | `prise_mandat` | Premier contact et prise de mandat | Courtier hypothécaire | Rôle, rémunération et divulgations expliqués; mandat traité si applicable |
| 2 | `analyse_projet` | Analyse de la situation et du projet | Courtier hypothécaire | Profil, revenus, dettes, mise de fonds, préférences et capacité documentés |
| 3 | `prequalification` | Préqualification ou préautorisation | Courtier hypothécaire | Lettre ou résultat de préautorisation consigné |
| 4 | `recherche_propriete` | Recherche de propriété | Client et courtier immobilier | Budget validé; étape non applicable pour certains refinancements/renouvellements |
| 5 | `promesse_achat` | Promesse d’achat et financement | Client | Offre acceptée, propriété, prix, mise de fonds et délai consignés |
| 6 | `montage_soumission` | Montage et soumission | Courtier hypothécaire | Documents requis complets et soumission transmise |
| 7 | `comparaison_options` | Options et recommandation | Courtier hypothécaire | Comparatif présenté et option choisie par le client |
| 8 | `approbation_finale` | Approbation finale | Prêteur et courtier | Engagement ferme et conditions satisfaites |
| 9 | `coordination_notaire` | Coordination avec le notaire | Courtier et notaire | Instructions transmises et exigences de signature complètes |
| 10 | `signature_decaissement` | Signature et déblocage | Notaire | Signature, inscription et décaissement confirmés |
| 11 | `suivi_post_transaction` | Suivi post-transaction | Courtier hypothécaire | Suivi de satisfaction et rappel de renouvellement planifiés |

## États

- `a_faire`
- `en_cours`
- `bloquee`
- `complete`
- `non_applicable`

Une étape conserve aussi le responsable, les dates de début, d’échéance et de fin, des notes et une liste de conditions. La progression exclut les étapes non applicables. L’étape courante est la première étape bloquée, en cours ou à faire.

## Intégration

- Migration : `database/016_parcours_hypothecaire.sql`
- Lecture : `crm.obtenir_parcours_dossier(code_client)` et champ `dossier.parcours_hypothecaire`
- Écriture : le formulaire existant transmet `parcours_hypothecaire` à `crm.enregistrer_dossier_hypothecaire`
- Orchestration : les webhooks n8n existants de lecture et d’écriture sont réutilisés
- Sécurité : aucune route ne reçoit un identifiant de représentant du navigateur; le contexte signé et les politiques RLS déterminent les dossiers visibles

Les statuts initiaux des dossiers existants sont proposés à partir des données déjà présentes. Le courtier doit les valider dans le dossier; aucune déduction automatique ne remplace cette validation métier.

## Portes documentaires cibles

La progression demeure aujourd’hui modifiable par le courtier. L’API
documentaire ajoutera des portes déterministes : identité et finances avant la
préqualification, promesse d’achat avant le montage, dossier complet avant la
soumission, conditions du prêteur avant l’approbation finale, puis assurance et
exigences notariales avant la signature.

Une porte bloquée retourne la liste des exigences non satisfaites. Seul un rôle
autorisé peut accorder une dérogation avec motif et audit. L’IA peut suggérer une
classification, mais ne complète jamais une porte. Voir
[`gestion-documentaire-ocr.md`](./gestion-documentaire-ocr.md).
