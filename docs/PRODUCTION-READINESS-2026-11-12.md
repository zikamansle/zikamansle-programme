# ZikaMansle — préparation du passage en production (12 novembre 2026)

## État vérifié via les comptes connectés

- Site public : `https://app.zikamansle.fr/`. Capture DNS IONOS reçue le 12 novembre 2026 : `app` est un CNAME vers `custom-domains.chatgpt.site`, avec vérifications `_cf-custom-hostname.app` et `_openai-site-verification...`. Le fournisseur DNS est IONOS ; l'hébergement actif est un ChatGPT Site. Les lignes `@` et `www` restent liées à Wix et ne doivent pas être modifiées.
- Version test validée manuellement sur Redmi par le propriétaire : `https://zikamansle-app-staging.zikamansle.workers.dev/` ; test d'une notification reçue.
- Worker connecté : `zikamansle-app-staging`. **Aucun Worker de production**.
- Zones DNS Cloudflare visibles : **aucune** ; domaines Workers personnalisés visibles : **aucun**.
- Base D1 de test : `zikamansle-app-staging` ; bucket R2 de test : `zikamansle-app-staging`.
- Secrets de test présents (noms uniquement) : `ADMIN_EMAIL`, `FCM_SERVICE_ACCOUNT_JSON`, `VAPID_PRIVATE_JWK`, `VAPID_PUBLIC_KEY`.
- Le code actuel de la nouvelle interface est sur `feat/zikateam-fiches-notifications` du dépôt `zikamansle/zikamansle-programme`. La branche `main` représente un projet ancien distinct : **ne pas fusionner automatiquement**.
- Les notifications de test utilisent leur propre clé VAPID et leur propre origine. Un test réussi sur workers.dev ne prouve pas la réception sur `app.zikamansle.fr`.

## Conditions impératives avant de remplacer le site en service

1. **Identifier précisément le déploiement IONOS** : contrat, dossier web et/ou projet Deploy Now, configuration DNS de `app`, chemin actuel du service worker, éventuel reverse proxy. Ne modifier aucun enregistrement en l'absence de ce relevé.
2. **Sauvegarder l'existant** : fichiers et base actuelle, abonnements push et état des notifications, données ZikaTeam et médias ; vérifier une possibilité réelle de restauration. Ne jamais transférer des secrets dans GitHub.
3. **Décider où sera hébergée la production** : garder IONOS (nécessite un pipeline IONOS effectif et un backend compatible), ou migrer de façon contrôlée vers Cloudflare. Une simple copie HTML sur IONOS ne suffit pas : D1, R2 et le backend Workers sont nécessaires à la nouvelle application.
4. **Si migration Cloudflare**, établir un Worker et des bases/buckets **de production distincts** des ressources de test, prévoir l'accès administrateur, intégrer les médias, importer les données à partir de sauvegardes vérifiées, installer un routage HTTPS valide pour le sous-domaine sans modifier le site principal.
5. **Notifications :** récupérer en sécurité la clé VAPID de production actuelle et les abonnements, puis vérifier la compatibilité de l'origine et du scope du service worker. Sans cela, prévoir une procédure explicite de réabonnement, sans prétendre conserver les abonnements.
6. **Recette** : deux appareils/comptes distincts pour tester les rôles administrateur, secrétariat, responsable, bénévole ; validation de la charte, réunions, signatures d'émargement, photos et consentements, messagerie, filtres ; programme, billetterie, plan, actualités, médias, cache hors ligne ; test push réel sur `app.zikamansle.fr`.
7. **Google Play** : tester l'APK/AAB réel sur le Redmi, gestion des notifications Android, comportement du bouton Retour, liens et assetlinks avant publication.
8. **Bascule** : faire une dernière sauvegarde à heure connue, préserver l'ancien site et conserver une procédure de retour arrière ; ne communiquer la mise en ligne qu'après contrôle HTTP/HTTPS, connexions et notifications réelles sur le domaine public.

## Interdictions de sécurité

- Ne pas rediriger immédiatement `app.zikamansle.fr` vers la copie workers.dev : le nouveau domaine doit être préparé et les abonnements/données traités.
- Ne pas réutiliser ni écraser D1/R2 de test pour la production.
- Ne pas activer la diffusion générale des notifications depuis la base de test ; le bouton de test cible uniquement le téléphone demandeur.
- Ne pas modifier DNS IONOS ni annoncer une mise en ligne publique sans connexion autorisée, configuration lisible et test de retour arrière.

## Vérifications déjà obtenues

- Réparation de `public/notifications.js` et test syntaxique automatisé.
- Boutons activer/désactiver fonctionnels sur la version de test selon retour utilisateur.
- Ajout du test de réception individuelle dans la rubrique Actualités ; confirmation utilisateur de réception.
- Suites automatisées GitHub réussies, déploiement Workers de test confirmé.

**Prochain blocage technique** : le compte connecté ne permet pas d'administrer le ChatGPT Site existant ni les DNS IONOS ; aucune zone Cloudflare `zikamansle.fr` n'est connectée. Tant que l'accès à la configuration du Site et au changement DNS n'est pas disponible, la bascule du sous-domaine ne peut pas être réalisée depuis cette conversation.

## Découverte de la cible actuelle (12 novembre 2026)

La capture du gestionnaire DNS IONOS montre explicitement :

- `CNAME app → custom-domains.chatgpt.site` : **hébergement ChatGPT Sites**.
- `TXT _cf-custom-hostname.app` et `TXT _openai-site-verification…` : preuves de configuration du domaine personnalisé de ChatGPT Sites.
- `A @ → 185.230.63.107` et `CNAME www → pointing.wixdns.net` : site racine et WWW Wix, hors périmètre de migration.
- Enregistrements `MX`, `SPF`, `DKIM`, `DMARC` : messagerie IONOS, hors périmètre de migration.

Le projet ChatGPT Site doit être identifié avant d'envisager un export ou une reprise du service existant ; une capture DNS n'autorise pas à modifier un déploiement ChatGPT Sites. Les abonnements push du domaine existant sont spécifiques à leur origine et au couple de clés VAPID ; la nouvelle paire de test n'est pas interchangeable.

Documentation officielle : https://help.openai.com/fr-fr/articles/20001339-creating-and-using-chatgpt-sites

## Audit lecture seule des bases (12 novembre 2026)

À partir des connexions utilisateur, sans exporter ni modifier de données personnelles :

| Source | Vérification |
| --- | --- |
| Supabase `ZikaMansle-Programme` | 2 tables publiques sous RLS : `zika_events` (18 lignes estimées), `zika_settings` (27 lignes estimées). Cela ne constitue pas une base des bénévoles. |
| Cloudflare D1 `zikamansle-app-staging` | Schéma ZikaTeam présent, dont membres, pôles, activités, messages, émargements, consentements, chartes et rôles. |
| D1 staging : effectifs à cet instant | `team_members` 2 ; `team_poles` 14 ; `team_activities` 1 ; `team_messages` 3 ; `team_signing_sessions` 6. |
| D1 staging : notifications | `push_subscriptions` 2 et `push_notifications` 4. |
| ChatGPT Sites, version publique | Capture fournie : `push_config`, `push_deliveries`, `push_notifications`, `push_subscriptions`. Le nombre d'abonnements actifs et les exportations réelles ne sont pas encore vérifiés. |

**Décision de sécurité :** ne pas considérer la base D1 de test comme une copie exhaustive de la base publique ; ne jamais effectuer de bascule du CNAME ou de suppression du Site public tant qu'un export sauvegardé et une procédure de reprise des abonnements push / des données existantes n'ont pas été effectivement vérifiés. Les 2 abonnements de staging sont propres au domaine de test et ne remplacent pas les abonnements du domaine public.

Le fait que le compte utilisateur donne accès au code GitHub, à Cloudflare et à Supabase ne confère pas automatiquement la permission de lire les tables privées d'un ChatGPT Site : accès séparé nécessaire.

## Point de restauration de la base de test (12 novembre 2026)

Accès Cloudflare connecté : l'API D1 Time Travel a renvoyé le bookmark `00000098-00000000-00005121-9392b4f31310a80ea881ca739099eea8` pour la base **de test** `32687c2b-b845-4d29-aa1e-34dea804ea34`. L'API d'export D1 a renvoyé `status=complete` et indiqué l'envoi d'un fichier SQL en une partie. L'existence d'une copie durable hors de l'API, téléchargée et contrôlée, **n'est pas attestée** ; le bookmark reste soumis aux durées de rétention Cloudflare.

Ne jamais confondre cette sauvegarde temporaire de staging avec la sauvegarde du **ChatGPT Site public**, toujours inaccessible via les connecteurs. Aucun fichier de données de production n'a été lu, aucun domaine n'a été modifié, aucun push général n'a été envoyé.

## Ressources de production créées (12 novembre 2026, après validation des essais bénévoles)

- D1 Cloudflare **production** : `zikamansle-app-production`, UUID `fe7c5010-d6e9-48ed-88aa-ff1402820e02`, juridiction UE ; distincte de D1 staging.
- Bucket R2 **production** : `zikamansle-app-production` (région WEUR) ; distinct du bucket staging.
- Config indépendante `wrangler.production.jsonc` : `APP_ENV=production`, `PUSH_SEND_ENABLED=false`, `TEAM_PUSH_ENABLED=false`, aucune route ou zone personnalisée ; service worker, D1 et R2 prévus.
- Garde `scripts/zikamansle-production-guard.mjs` et test `tests/production-isolation.test.mjs` ajoutés.
- Workflow GitHub `.github/workflows/deploy-zikamansle-production.yml` créé sous `workflow_dispatch` et environnement protégé `zikamansle-production` : **ne s'exécute pas automatiquement** ; il nécessite un jeton Cloudflare et l'identifiant du compte autorisés dans les secrets de cet environnement, puis applique les migrations et déploie sur workers.dev uniquement. Son accessibilité depuis GitHub Actions doit être vérifiée, car un workflow ajouté sur une branche non par défaut peut ne pas être déclenchable tant qu'il n'est pas présent dans la branche par défaut.
- CI GitHub : les suites `Vérifier l’application` et `Vérifier ZikaTeam (sans publication)` sont réussies pour le commit `2076014cc9b4ea7ef2eadcb487785c3cccd2d11e`.
- Vérification Cloudflare : D1 production et R2 production existants ; le seul Worker déployé reste `zikamansle-app-staging`. Aucun routage vers `app.zikamansle.fr` n'a été modifié. La D1 production est **vide** tant que les migrations ne sont pas appliquées.

**Bloqueurs restants :** déploiement du Worker avec ses secrets réels de production, préparation/validation des accès ZikaTeam, test push réel depuis l'origine définitive, puis changement contrôlé du CNAME IONOS `app` (uniquement). Les comptes tests ne nécessitent pas de migration, mais les abonnés push du Site public devront probablement se réinscrire. Le site public ChatGPT Sites reste disponible en attendant.

## Worker de production effectivement déployé (12 novembre 2026)

- Worker Cloudflare **zikamansle-app-production** déployé le 12/11/2026, `https://zikamansle-app-production.zikamansle.workers.dev/`. Aucun changement de `app.zikamansle.fr`, qui reste chez ChatGPT Sites.
- Vérification HTTP du Worker via Cloudflare Browser Rendering : `/healthz` renvoie `{"app":"ZikaMansle","environment":"production"}`.
- Migrations D1 appliquées : **46 tables ZikaTeam** présentes. La base de production part de zéro : `team_members=0` et `push_subscriptions=0`.
- Deux secrets créés sur ce Worker, et lui seul : `VAPID_PRIVATE_JWK` et `VAPID_PUBLIC_KEY`, avec une nouvelle paire P-256 distincte de staging. La clé privée n'a pas été écrite dans GitHub ni montrée dans l'échange.
- Notifications générales verrouillées : `PUSH_SEND_ENABLED=false`, `TEAM_PUSH_ENABLED=false`. `PUSH_TEST_ENABLED=true` permet uniquement le test individuel ciblé par abonnement.
- Workflow approuvé exécuté depuis le workflow GitHub connu et opérationnel ; vérifications générales GitHub réussies. Dernier déploiement Cloudflare vérifié.
- `ADMIN_EMAIL` et les paramètres FCM éventuels de production ne sont **pas encore configurés**, puisque l'identité du compte administrateur exact et les secrets Play Store n'ont pas été vérifiés. Il faut configurer ces éléments avant l'ouverture au public et l'activation des envois.
- Recette Android sur **cette nouvelle origine** non effectuée : le test push déjà réussi était sur `zikamansle-app-staging.zikamansle.workers.dev`, et ne valide pas automatiquement la nouvelle paire VAPID.
- Route/custom domain Cloudflare : aucune zone DNS `zikamansle.fr` n'est connectée au compte Cloudflare ; **NE PAS** simplement transformer le CNAME IONOS `app` en cible `*.workers.dev` sans configuration Cloudflare de domaine personnalisé, TLS et sauvegarde du routage existant.

**Prochaines vérifications impératives :** tester le nouveau Worker sur Redmi, confirmer l'e-mail exact de l'administrateur ZikaTeam, obtenir un raccordement HTTPS contrôlé du sous-domaine côté hébergement/DNS (sans perturber le Wix et les e-mails du domaine), activer les notifications générales seulement après recette. Si l'ancien site utilise une VAPID différente, les navigateurs devront se réabonner sur l'origine publique.

## Préparation du domaine Cloudflare (12 novembre 2026 — zone non activée)

- L'adresse administrateur `zikamansle@gmail.com` a été vérifiée présente dans `auth.users` Supabase et configurée sur le Worker de production comme secret `ADMIN_EMAIL`. La clé VAPID privée reste un secret Cloudflare.
- Zone Cloudflare `zikamansle.fr` créée en mode **full**, `status=pending`. Aucune modification des serveurs de noms IONOS n'a été effectuée.
- Serveurs de noms Cloudflare indiqués par cette zone : `destiny.ns.cloudflare.com` et `noel.ns.cloudflare.com`. **Ne pas les renseigner chez IONOS avant finalisation des contrôles.**
- Le scanner DNS Cloudflare a identifié 9 enregistrements publics ; ces neuf enregistrements ont été acceptés dans la zone en attente sans activer le domaine.
- Reprises manuelles depuis la capture DNS IONOS : les deux `CNAME s1-ionos._domainkey` et `s2-ionos._domainkey`, et `TXT _cf-custom-hostname.app`. Total : **12 enregistrements** visibles dans la zone Cloudflare en attente.
- Vérifications de non-régression : `A @` vers Wix `185.230.63.107`, `CNAME www` vers `pointing.wixdns.net`, `MX` vers `mx00.ionos.fr` / `mx01.ionos.fr` priorité 10, SPF IONOS, DMARC, DKIM et autodiscover, le tout non proxifié. `CNAME app` est encore `custom-domains.chatgpt.site`, pour ne pas couper l'ancienne application avant le passage final.
- **Enregistrement encore manquant :** `TXT _openai-site-verification...` dont nom complet et contenu sont tronqués dans la capture ; la rétention des vérifications d'ancien domaine est à évaluer avant la bascule, et les autres entrées éventuellement masquées doivent être vérifiées.
- Les Workers Custom Domains requièrent une **zone Cloudflare active** ; sans cela, `app.zikamansle.fr` ne peut pas encore être associé en HTTPS à `zikamansle-app-production`. Voir https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ .
- Une zone `full` nécessite un changement des serveurs de noms autoritaires chez IONOS. Ce changement affecterait **toutes** les entrées du domaine, y compris Wix et la messagerie. À ne faire qu'après une vérification exhaustive des enregistrements et du statut DNSSEC, puis en maintenant un plan de retour arrière.
- L'ancienne application reste en ligne via `app.zikamansle.fr`. Le serveur Cloudflare production est disponible sur son adresse `workers.dev`, avec les notifications individuelles validées sur Redmi par l'utilisateur.

## Administration indépendante des notifications d'actualités — production

- Cloudflare Access dédié à `app.zikamansle.fr/administration/*`, réservé exclusivement à `zikamansle@gmail.com`. Il est **distinct** du système de connexion ZikaTeam/Supabase.
- Le Worker de production contrôle le JWT signé Cloudflare Access avant de servir `/administration/notifications`, et l'API d'envoi requiert également ce JWT pour créer, envoyer et gérer les annonces.
- Mise à jour du `wrangler.production.jsonc` : `PUSH_SEND_ENABLED=true` ; `TEAM_PUSH_ENABLED=false`. Envoi des actualités désormais possible uniquement après action de l'administrateur ; notifications automatiques ZikaTeam toujours désactivées.
- Garde de déploiement mise à jour pour vérifier les contrôles serveur de sécurité ; tests automatisés GitHub réussis, et redéploiement de production confirmé sur Cloudflare.
- Vérification finale du 12/11/2026 : Worker raccordé à `app.zikamansle.fr` ; le compte Access ne permet que `zikamansle@gmail.com` ; 1 abonnement push, 0 actualité publique, 0 profil ZikaTeam en base production. **Aucun message général n'a été envoyé pendant cette configuration.**
- Reste à confirmer manuellement l'authentification Access sur `https://app.zikamansle.fr/administration/notifications`, l'envoi d'un message de test ciblé par l'administrateur, et l'accès administrateur ZikaTeam après création initiale du profil ; l'automatisation ZikaTeam sera activée seulement après cette recette.
