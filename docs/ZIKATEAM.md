# ZikaTeam — administration et espace bénévoles

Ce module est en développement **sur une branche isolée**, sans changer le programme public ni `app.zikamansle.fr`. La version de test utilise le Worker `zikamansle-app-staging`, D1 et R2 déjà séparés. **Ne pas importer des adresses de bénévoles ou activer l'envoi automatique avant d'avoir testé les accès.**

## Navigation

- Application → Plus → **ZikaTeam** (`/zikateam`) : espace privé, accessible sur téléphone et ordinateur
- **Ma fiche** : identité, pôles et responsables, charte officielle, prochains rendez-vous, activation des notifications associées
- **Mon agenda** : réunions, stands, permanences, montage et missions ; réponse « Présent », « Absent » ou « À confirmer », inscription aux créneaux
- **Discussions** : générale, par pôle ou par activité, après acceptation de la charte
- **Gestion des équipes** : administrateur pour tous les pôles, responsables pour leurs seuls pôles ; gestion de la composition, activités, créneaux, tâches, pointage, réponses et journal d'administration

L'administration crée les bénévoles et nomme les responsables. Un responsable peut éditer son pôle, en gérer les membres, créer des activités pour ses pôles seulement, attribuer des tâches et pointer les présences. Il ne peut pas se nommer administrateur, affecter un autre pôle ou cibler toute l'association.

L'ancien schéma ZikaTeam de la migration `0004_zikateam_secure.sql` est conservé sous des tables `*_legacy`. Les anciens bénévoles, affectations, messages, réunions et réponses sont repris dans le nouveau modèle sans supprimer les originaux. Contrôler les effectifs et les journaux d'import avant toute ouverture aux utilisateurs.

La suppression d'un pôle est une **archive réversible** pour préserver les historiques. La version de charte est immuable : toute nouvelle version doit être explicitement acceptée. Les documents acceptés sont des PDF de maximum 8 Mo, conservés dans R2 privé et servis uniquement aux personnes autorisées.

## Authentification — action indispensable du propriétaire

Il faut configurer **une deuxième application Cloudflare Zero Trust → Access → Applications → Self-hosted**, distincte de celle de l'administration des notifications :

- Nom : « ZikaTeam – bénévoles »
- Domaine : `zikamansle-app-staging.zikamansle.workers.dev`
- Chemins protégés : `/zikateam*` (page et API)
- Méthode : One-Time PIN par e-mail ou identité compatible
- Règle Access : autoriser uniquement les comptes prévus pour ZikaTeam ; le serveur applique en plus une liste de bénévoles actifs `team_members`. Une identité non inscrite est rejetée, même après connexion Access.
- Relever le **Application Audience Tag** (AUD) de cette nouvelle application, sans le confondre avec `ACCESS_AUD` de l'administration des notifications.
- Définir `TEAM_ACCESS_AUD` comme variable de l'environnement GitHub `zikamansle-staging` et redéployer. Le Worker l'utilise pour vérifier cryptographiquement le jeton ; à défaut, toute connexion à ZikaTeam est refusée.
- Garder `ACCESS_TEAM_DOMAIN` commun au même tenant Cloudflare et `ADMIN_EMAIL` comme seule identité administratrice générale.

La page d'administration des notifications `/administration/notifications` conserve ses protections et permissions existantes. Ne pas protéger tout le Worker par Access : les visiteurs doivent consulter l'application publique sans connexion.

## Base, tests et déploiement

1. Sauvegarder D1 et R2 staging.
2. Appliquer en ordre les migrations D1 `drizzle/0100_zikateam.sql`, `drizzle/0101_team_operations.sql`, puis `drizzle/0102_zikateam_legacy_import.sql`. La commande `npx wrangler d1 migrations apply zikamansle-app-staging --remote` fonctionne après configuration des secrets et des identifiants du Worker de test.
3. Exécuter `npm ci`, `npm test` et `npm run build`. La compilation `build` est un dry-run, pas une publication.
4. Déployer la **branche cible de test**, sans pointer de domaine personnalisé et sans fusion avec `main`. Le workflow `deploy-staging.yml` reste verrouillé par la variable `ZIKA_DEPLOY_ENABLED` et ne se déclenche automatiquement que sur `migration/application-autonome`.
5. Vérifier depuis un téléphone puis un ordinateur : accès admin, accès responsable et bénévole, refus hors équipe, PDF, charte, présence, créneaux, messagerie, tâches et pointage.
6. Vérifier les notifications isolées sur **un seul appareil volontaire** avant d'autoriser les notifications de groupe. Ne pas publier une convocation réelle sans recette complète.

## Notifications automatiques

La publication d'une réunion ou d'une mission crée uniquement les convocations pour les membres du public sélectionné : tous les bénévoles, tous les responsables ou les pôles choisis. Les appareils sont associés à la fiche bénévole à partir d'un abonnement push déjà autorisé. L'envoi et les rappels sont bloqués **par défaut** par `TEAM_PUSH_ENABLED=false`. Les rappels sont programmés aux environs de 24 heures et de 2 heures avant l'activité et excluent les réponses « Absent ».

En production, envisager `TEAM_PUSH_ENABLED=true` **seulement** après validation de l'authentification, des clés VAPID correspondant au domaine, de l'abonnement par membre et des tests de non-diffusion aux autres pôles. Ce réglage est distinct de `PUSH_SEND_ENABLED` destiné aux actualités publiques.

**Limite Android** : la livraison des push web ne prouve pas celle des notifications natives Firebase de l'APK/AAB. Tester séparément l'application Android réelle sur un appareil, en arrière-plan et écran verrouillé. Ne pas assimiler ces tests.

## RGPD et exploitation

- Informations privées : noms, e-mails, affectations, réponses, messages, horodatages de charte, journaux et pointage. À protéger avec les règles de conservation de l'association.
- Ne jamais exposer les données ZikaTeam à l'API publique ou au cache du service worker.
- Les accès sont contrôlés sur **chaque** appel API, pas uniquement en masquant les boutons.
- Avant mise en service, fournir aux bénévoles la politique de confidentialité et les modalités de retrait de leur accès. Prévoir export et purge des données selon les durées décidées par l'association.
- La charte doit être importée depuis le document officiel, non rédigée ou validée automatiquement.
