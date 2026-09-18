# Contrats mobiles

Ces contrats constituent la frontière stable entre les applications Android et
iOS et l’API privée. Ils évitent de dupliquer les règles métier dans chaque
application.

## Parcours courant — Android 0.9

`summary-email-v1.schema.json` décrit le message `SUMMARY_EMAIL` envoyé à
`POST /api/mobile/jobs` après finalisation et confirmation explicite. Il contient
uniquement le titre, les deux textes, l’identifiant/révision de note et le
destinataire confirmé. Ni audio, ni fiche client, ni résumé local. L’identité
du représentant provient du jeton, pas du corps de requête.

La validation d’exécution est dans `src/mobile.js` (le schéma documente le
message émis, il n’est pas chargé dynamiquement). Elle rejette un texte blanc,
une confirmation périmée, une adresse multiple ou invalide. Les champs
supplémentaires historiques sont ignorés, jamais propagés au workflow.
Les plafonds en exécution sont comptés en unités UTF-16 par JavaScript/Kotlin.

Voir [le parcours et la configuration 0.9](../../docs/mobile-0.9-synthese-courriel.md).
L’API conserve les anciens types `ANALYSIS` et `EMAIL`, distincts de ce message;
le schéma historique ci-dessous ne décrit pas le nouvel envoi.

## Historique — contrat de conversation version 1

`conversation-note-v1.schema.json` décrit une note de conversation et son état
de validation. Le média est envoyé séparément en flux multipart; son chemin
local n’appartient jamais au contrat réseau.

Principes :

- même contrat et mêmes états sur Android et iOS;
- identifiant UUID créé sur le téléphone pour l’idempotence;
- empreinte SHA-256 du média avant synchronisation;
- taille maximale de 25 Mio et durée maximale d’une heure;
- aucune écriture CRM avant le statut `FINALIZED`;
- ajout de champs uniquement par une nouvelle version du contrat.

## Historique — évolution locale Android 0.4.0

L’éditeur Android stocke désormais `personalNotes` à côté de `transcript` dans
ses fichiers privés. Cet ajout **n’est pas une extension du contrat réseau v1**
et aucun transfert réseau n’est implémenté. Une v2 devra spécifier les deux
sources, leur provenance et les options d’envoi avant la phase 2 n8n.
`followUpEmail` reste le texte du brouillon de courriel, pas une adresse.

Voir la [feuille de route mobile et n8n](../../docs/mobile-transcription-notes-phase2.md).
