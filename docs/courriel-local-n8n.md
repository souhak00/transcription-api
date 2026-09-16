# Courriel Tonia — Postfix et Mailpit locaux

## Nouveau : test réel du LLM privé — 9 septembre 2026

Le [nouveau workflow de synthèse](http://localhost:5678/workflow/ToniaSyntheseTestLocalV1)
**Tonia — TEST synthèse LLM privé vers Mailpit** a été ajouté sans remplacer le
test de transport initial. Il exécute : sources fictives → Ollama local
`mistral-nemo` → validation de réponse → Postfix → Mailpit.

La synthèse est réellement produite par le modèle; seuls les renseignements
sources sont fictifs. Le [premier résultat](http://localhost:8025/view/4pEqZL4bEEiESGXKpUGwQJ)
est consultable tant que la politique de rétention Mailpit le conserve.

Pour tester, ouvrir **ce nouveau workflow**, cliquer **Execute workflow**, puis
consulter le message **Tonia — TEST LOCAL — synthèse générée par le LLM**.
Le premier essai a pris environ 19 secondes dans n8n, puis 15 secondes dans
la file SMTP; ce délai dépend du matériel et de la charge du modèle.

Les sources de recette sont dans le nœud **Transcription et notes de test**,
champs `transcript` et `personalNotes` du code JavaScript. Pour un autre essai,
modifier ces textes en conservant une syntaxe JavaScript valide, sans données
personnelles réelles. Ne pas modifier l'adresse : `recette@example.invalid`
reste fixée par le workflow, jamais par le LLM. Le scénario de transport
ancien envoie toujours le texte fictif fixe : ce sont deux tests distincts.

Cette recette courte refuse les sources dépassant **8 000 caractères de
transcription et 4 000 de notes**. Elle n'est pas le pipeline de segmentation
des conversations d'une heure. Un JSON invalide, une synthèse vide, trop longue
ou tronquée interrompt l'exécution avant le courriel. Les textes sources sont
repris intégralement dans le message. Le modèle ne dispose d'aucun outil ni
d'action sur les dossiers ou sur le destinataire.

Un seul appel Ollama par exécution, pas de relance automatique, délai maximum
de 5 minutes pour l'appel. La demande `keep_alive: 2m` limite le maintien du
modèle après utilisation; d'autres requêtes peuvent prolonger ce maintien.
Ne pas lancer plusieurs tests simultanément. Aucun modèle supplémentaire
n'a été téléchargé. Le coût mémoire du LLM est **en plus** des conteneurs mail.

**Résultat observé :** montants conservés, absence de préapprobation mentionnée,
estimation des travaux identifiée comme observation du représentant et date
du rendez-vous restant à préciser. Le résumé omet cependant que les bulletins
de paie sont déjà disponibles et ne respecte pas parfaitement les sections
demandées. Une validation JSON ne garantit pas la fidélité ou l'exhaustivité :
la relecture et l'accès aux sources restent nécessaires.

**Vérifications :** exécution réelle réussie et courriel retrouvé dans Mailpit;
154 tests Node réussis, dont 4 nouveaux tests sur ce workflow. Le téléphone,
les workflows mobiles de production et les expéditions Internet restent non
raccordés à cette recette. Aucun service existant n'a été redémarré.

Fichiers : `n8n-workflows/mobile_synthese_test_local_v1.json` et
`tests/node/mail-summary-local.test.js`.

## État vérifié le 8 septembre 2026

**Circuit installé et testé sur le poste local : n8n → Postfix → Mailpit.**
Il ne livre aucun courriel sur Internet. Le SMTP du VPS et le workflow mobile
de production restent désactivés : aucun expéditeur réel ni DNS n'a été choisi
ou modifié pendant cette installation.

- Consultation : [Mailpit local](http://localhost:8025).
- Test manuel : [workflow n8n local](http://localhost:5678/workflow/ToniaCourrielTestLocalV1),
  nommé **Tonia — TEST courriel local (aucun envoi réel)**.
- Connexion SMTP ajoutée : **Tonia SMTP TEST LOCAL — aucun envoi réel**.
- Le workflow contient une synthèse **fictive**, une transcription fictive et des
  notes fictives. Il ne sollicite ni Ollama, ni les dossiers CRM, ni le téléphone.
- Les 7 workflows et 5 identifiants n8n préexistants ont été exportés avant ajout
  vers `backups/mail-setup-2026-09-08/`; les identifiants restent chiffrés. Aucune
  clé de chiffrement n8n n'a été copiée dans Git. Ce sont des exports de précaution,
  pas une sauvegarde complète de l'instance et de sa clé de chiffrement.

## Utilisation

Ouvrir le workflow, puis **Execute workflow / Exécuter le workflow**. Il n'a pas
de déclencheur automatique et n'a pas besoin d'être publié. Attendre environ
15 secondes pour que Postfix transmette le message, puis consulter Mailpit.
Chaque exécution manuelle crée volontairement un nouveau courriel de recette.

L'adresse `recette@example.invalid` est fictive. Ne pas remplacer les données
par celles d'un client. Aucune adresse réelle n'est nécessaire pour cette recette.

Un succès n8n signifie **accepté dans la file Postfix**, pas « reçu par un client ».
Le dernier nœud retourne explicitement `externalDelivery: false`. La présence
dans Mailpit confirme la seconde étape du transport local.

## Isolation et ressources

```text
n8n existant : 172.29.240.10
    → smtp-test:587 : 172.29.240.2
    → mailpit:1025 : 172.29.240.3
        ↑ interface HTTP uniquement
    mail-ui : 172.29.240.4 ← 127.0.0.1:8025
```

- Réseau `tonia-mail-test` Docker **internal** : les serveurs Mailpit et Postfix
  n'ont aucune interface connectée à un réseau sortant. Le proxy HTTP est séparé;
  il n'offre pas de relais SMTP ni de proxy HTTP générique.
- Aucun port SMTP n'est publié sur l'hôte. Le proxy Web est lié à `127.0.0.1`
  uniquement et refuse les en-têtes Host étrangers. Il n'est pas exposé par le
  Caddy du CRM. Il n'est pas accessible depuis le Samsung ni depuis Internet.
- Postfix accepte seulement n8n à l'adresse `.10`, l'expéditeur
  `tonia@example.invalid`, un destinataire `@example.invalid` et un message de
  4 Mio maximum. Les envois vers un autre domaine sont rejetés avant DATA.
- La connexion n8n/Postfix est sans mot de passe et sans TLS **uniquement sur ce
  réseau privé du même hôte**. Ne pas réutiliser ce réglage pour une connexion distante.
- Mailpit n'a ni configuration de relais ni transfert externe. Ses vérifications
  de version et de DNS inverse sont désactivées. Le workflow utilise du texte,
  sans ressources HTML distantes.
- File Postfix et base Mailpit dans des volumes distincts persistants. Mailpit
  efface automatiquement les messages de test au-delà de **100 messages ou 7 jours**.
  Ce n'est pas un système d'archivage de données client. Postfix expire les échecs
  de recette après un jour.
- Espacement par transport de 15 secondes, un destinataire par message; il ne
  s'agit pas seulement d'une limite par domaine. La file absorbe les pointes.
- Plafonds : Postfix **256 Mio / 0,25 CPU**, Mailpit **128 Mio / 0,25 CPU**, proxy
  **64 Mio / 0,1 CPU**. Ce sont des limites, pas des réservations ni des mesures.
- Mesure ponctuelle après recette : Postfix **42,24 Mio**, Mailpit **7,59 Mio**,
  proxy **12,44 Mio**, soit environ **62 Mio** au repos. Ce n'est pas une garantie
  de consommation en charge. Les images occupent aussi de l'espace disque.
- Journaux Docker bornés (2 × 5 Mio par service), sans corps de message. Les
  adresses des journaux Postfix sont masquées; les identifiants SMTP restent présents.

Le proxy supplémentaire est nécessaire avec la version Docker Desktop testée :
les ports publiés sur un conteneur relié seulement à un réseau `internal`
n'étaient pas accessibles depuis Windows. Aucun service existant n'a été redémarré.

## Fichiers et redémarrage

- `deploy/mail/compose.test.yml` : circuit de recette.
- `deploy/mail/test-senders`, `test-recipients` : listes de contrôle SMTP.
- `deploy/mail/Caddyfile.test` : consultation locale.
- `deploy/mail/n8n-smtp-test.credential.json` : connexion de test **sans secret**.
- `n8n-workflows/mobile_courriel_test_local_v1.json` : scénario manuel isolé.

Depuis la racine du dépôt :

```powershell
docker compose -f deploy/mail/compose.test.yml up -d
docker compose -f deploy/mail/compose.test.yml ps
```

La connexion réseau du conteneur n8n existant a été ajoutée sans redémarrage.
Elle persiste lors d'un simple redémarrage. Si **n8n est recréé**, vérifier son
nom et les réseaux avant de le rattacher de nouveau :

```powershell
docker network connect --ip 172.29.240.10 tonia-mail-test N8N_Local
```

Ne pas exécuter cette commande si n8n est déjà raccordé. Sur une autre installation,
vérifier d'abord que `172.29.240.0/28` ne chevauche pas un réseau existant.
Lors de l'intégration ultérieure dans le Compose propriétaire de n8n, déclarer
ce réseau externe et l'adresse `.10` dans ce Compose; ne pas recréer n8n sans
sauvegarde pour ce seul changement.

Pour arrêter seulement la recette sans supprimer ses volumes :

```powershell
docker compose -f deploy/mail/compose.test.yml stop
```

**Ne pas utiliser `down -v`** : les messages et la file de test seraient supprimés.

## Vérifications effectuées

- Exécution réelle des cinq nœuds n8n; message accepté par Postfix puis capturé
  par Mailpit, avec accents, transcription et notes intactes.
- Capture retrouvée après redémarrage de Mailpit, même identifiant de message.
- Refus SMTP effectifs : domaine destinataire externe, mauvais expéditeur,
  deuxième destinataire, taille annoncée excessive, adresse IP non autorisée.
  Ces contrôles n'envoient jamais DATA.
- Interface locale HTTP 200; Host non autorisé HTTP 403; aucun port SMTP publié.
- Test du verrou de production dans un conteneur **sans réseau** : refus attendu.
- **150 tests Node réussis**, dont 9 nouveaux tests dédiés au courriel;
  `npm run check` et validation Compose réussis.
- Les conteneurs CRM, n8n, PostgreSQL et Keycloak existants restent en service.

Contrôles SMTP reproductibles après installation :

```powershell
docker cp scripts/test_mail_smtp.mjs N8N_Local:/tmp/tonia-test-mail-smtp.mjs
docker exec N8N_Local node /tmp/tonia-test-mail-smtp.mjs
```

La version amont Postfix 5.1.0 affiche quelques avertissements de démarrage
(anonymiseur Python et alias locaux non utilisés). Ils n'ont pas empêché la
recette; leur traitement fait partie du durcissement avant activation réelle.
La fonction d'anonymisation observée masque bien les adresses des messages testés.

## Production : intégrée au code, non activée

`deploy/mail/compose.outbound.yml`, `.env.smtp.example`, `prepare-outbound.sh`,
`verify-outbound-dns.sh` et `outbound-gate.sh` préparent un SMTP sortant séparé.
L’identité retenue est `administration@toniaconseil.com`, avec
`mail.toniaconseil.com` comme nom du serveur. Ne pas combiner les Compose de test et de
production, ni changer le relais du conteneur de recette pour Internet : une
file de test ne doit jamais pouvoir partir vers des destinataires réels.

Le profil `outbound` est explicite; le verrou reste `TONIA_MAIL_RELEASE=blocked`.
Le démarrage est refusé tant que l'expéditeur, son domaine et des clés DKIM sont
absents. Le mot `approved` est une **confirmation opérateur**, pas une preuve
automatique que les DNS ou la réception fonctionnent.

Le modèle n8n `mobile_envoi_note_v1.json` a un identifiant de webhook stable,
un expéditeur fixe et la connexion interne `ToniaSmtpOutboundV1`. Son verrou
lit `MOBILE_EMAIL_RELEASE`, qui vaut `blocked` par défaut. L’API applique le
même verrou avant même de créer un travail. Les variables de production sont
raccordées à n8n mais restent donc annoncées indisponibles au téléphone tant
que la recette n’est pas approuvée.

Le script `deploy/production/import-mobile-mail-workflows.sh` génère la
connexion d’en-tête avec le secret de `.env.production`, importe les deux
connexions n8n et les workflows, puis détruit son JSON temporaire. Les
workflows restent désactivés. Aucun secret n’est versionné.

### Ce qui reste nécessaire avant une mise en service réelle

1. **Choisir et autoriser une adresse d'expédition**, son domaine et un destinataire
   de recette. Vérifier un routage de retour fonctionnel pour les réponses et
   les avis d'échec; un SMTP sortant ne crée pas à lui seul une boîte de réception.
2. Sur le VPS : vérifier mémoire disponible, adresse IPv4 publique, connectivité
   SMTP 25 et absence de chevauchement du réseau `172.29.241.0/28`. Hostinger
   annonce 5 courriels/minute; vérifier les conditions et limites applicables.
3. Configurer A/PTR cohérents, SPF, DKIM et DMARC pour l'expéditeur retenu,
   **sans écraser les MX ou SPF des messageries existantes**. Préférer un
   sous-domaine d'envoi dédié si cela convient au domaine retenu.
4. Générer une clé DKIM privée persistante, sélecteur `tonia`, sur le serveur.
   Garder la clé hors Git dans `deploy/mail/runtime/dkim`; publier uniquement
   la clé publique. Contrôler permissions et signature effective avec l'image
   épinglée avant de lever le verrou. Le modèle ne génère aucune clé automatiquement.
5. Durcir/valider le conteneur sortant et le déclarer dans l'exploitation du VPS :
   réseau réservé à n8n (`172.29.241.10`), aucun port SMTP public, logs bornés,
   alertes sur messages différés/expirés, sauvegarde chiffrée de la file et des clés.
   Le modèle est à `restart: "no"` tant que la recette opérateur n'est pas terminée.
6. Configurer une **nouvelle connexion SMTP de production** dans n8n, jamais celle
   de test; fixer l'expéditeur du nœud courriel, garder le destinataire issu de
   la confirmation mobile. Activer les workflows privés et leurs secrets serveur
   seulement après recette. Aucun secret sur le téléphone ou dans Git.
7. Faire un envoi explicitement autorisé avec du contenu fictif; vérifier réception,
   signature, retours d'échec, absence de doublons et reprise. L'acceptation SMTP
   ne garantit ni livraison ni classement en boîte principale.

Le modèle sortant impose TLS pour le transport Internet et ne se replie pas
vers un SMTP en clair; cela peut différer puis faire échouer un envoi vers un
serveur incompatible. **Ce n'est pas du chiffrement de bout en bout** : les serveurs
de messagerie destinataires accèdent au contenu. Le téléphone peut rester hors
ligne pour ses opérations locales, mais la livraison à une adresse Internet
requiert Internet et contacte nécessairement le serveur du destinataire.

Le LLM privé, la fidélité d'une synthèse réelle et le trajet complet Android →
API → n8n → Ollama → boîte réelle ne sont pas validés par cette recette de transport.

## Sources techniques

- [Mailpit : images Docker](https://mailpit.axllent.org/docs/install/docker/)
  et [paramètres de fonctionnement](https://mailpit.axllent.org/docs/configuration/runtime-options/).
- [Image Postfix communautaire bokysan, version utilisée 5.1.0](https://github.com/bokysan/docker-postfix/tree/v5.1.0).
  C'est une image communautaire, pas une image officielle du projet Postfix.
- [Configuration Postfix](https://www.postfix.org/BASIC_CONFIGURATION_README.html).
- [Commandes CLI n8n](https://docs.n8n.io/hosting/cli-commands/).
- [Port 25 et limite Hostinger](https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-hostinger-vps/).
- [Exigences de réception Gmail](https://support.google.com/mail/answer/81126?hl=fr).
