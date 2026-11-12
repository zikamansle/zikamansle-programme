# ZikaMansle — préparation du passage en production (12 novembre 2026)

## État vérifié via les comptes connectés

- Site public demandé : `https://app.zikamansle.fr/` (hébergement/routage IONOS déclaré par le propriétaire).
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

**Prochain blocage technique** : le compte connecté ne contient ni la configuration IONOS actuelle ni une zone Cloudflare rattachée à `zikamansle.fr`. Aucun outil d'administration IONOS n'est connecté. Tant que cet accès technique manque, la bascule du sous-domaine ne peut pas être réalisée de façon fiable depuis cette conversation.
