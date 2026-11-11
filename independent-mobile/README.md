# ZikaMansle — reprise indépendante (chantier de migration)

## Objectif
Gérer l'application mobile ZikaMansle depuis un dépôt GitHub appartenant à ZikaMansle, sans dépendre de crédits ChatGPT Work pour la modifier ou l'héberger.

**État** : sauvegarde de la partie publique dans `public/`. Elle est une base de reprise, **pas encore une application autonome déployable avec toutes les fonctions**.

## Source de la copie
Les fichiers sont récupérés en accès public et sans authentification depuis `https://app.zikamansle.fr/`. Leur intégrité et la liste des éléments copiés figurent dans `source-manifest.json`. Aucun mot de passe, token administrateur, secret de serveur ni base de données n'a été exporté.

Le fichier `public/mobile.js` contient une entrée *Administration* dans le menu Plus, pointant vers la page existante `/admin-notifications`. **Le droit d'envoyer doit toujours être vérifié côté serveur.** Le simple masquage du bouton n'est pas un mécanisme de sécurité.

## Dépendances à migrer avant de basculer le DNS

1. **API de contenus** : `/api/site-page` et toute autre API appelée par les écrans. Préserver les pages, images, programmes, horaires, billetterie, favoris et navigation.
2. **Notifications push** : sous `/api/push/{subscribe,unsubscribe,selftest,test-status,admin,create,send,clear-history,upload}`, avec données, statistiques, médias et clé privée VAPID sécurisée côté serveur. Ne jamais commettre cette clé dans GitHub.
3. **Administration** : conserver une authentification réelle et des autorisations serveur strictes avant toute commande d'envoi, en utilisant un compte propriétaire maîtrisé par l'association.
4. **Stockage** : la base de données des abonnements push et historiques d'envoi est hébergée côté ChatGPT Sites. La sauvegarde des fichiers publics ne l'inclut pas. Sans export autorisé du serveur et de sa clé VAPID, la migration peut imposer une **nouvelle inscription volontaire aux notifications**.
5. **Service worker / PWA** : conserver `sw.js`, les icônes et le manifeste sur le même domaine HTTPS. Vérifier cache et affichage sans ligne.
6. **Android** : conserver le package `fr.zikamansle.app` et les certificats de signature corrects; publier `/.well-known/assetlinks.json` avec la vraie SHA-256 de Google Play App Signing afin que Chrome puisse déléguer les notifications à ZikaMansle.

## Ordre sécurisé

- Conserver **inchangés** `app.zikamansle.fr` sur ChatGPT Sites, ses DNS IONOS et l'application qui fonctionne sur le Redmi.
- Mettre en place un hébergement **de préproduction** contrôlé par l'association avec un **domaine différent** et un backend séparé.
- Tester les écrans, la navigation, l'administration, l'envoi test, la réception avec écran éteint et les favoris.
- Exporter/importer les données autorisées si possible; sinon documenter la réinscription push.
- Basculer le CNAME `app` uniquement après réussite des tests de préproduction et sauvegarde de l'application actuelle.

## Points bloquants ouverts

- Aucun outil connecté à cette conversation ne permet de lire les sources privées, secrets ni données du backend actuel de ChatGPT Sites.
- Un export du site et de ses données depuis le projet propriétaire serait la solution la plus fidèle. La documentation officielle indique que l'export du code peut être demandé à Codex et que les sauvegardes de base de données/fichiers se font séparément.
- Les fichiers sous `public/` constituent seulement la **surface publique** obtenue par récupération HTTP; ne pas les déployer à la place de l'app existante à ce stade.
