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
