# ZikaTeam — administration et espace bénévoles

Ce module est en développement **sur une branche isolée**, sans changer le programme public ni `app.zikamansle.fr`. La version de test utilise le Worker `zikamansle-app-staging`, D1 et R2 déjà séparés. **Ne pas importer des adresses de bénévoles ou activer l'envoi automatique avant d'avoir testé les accès.**

## Navigation

- Application → Plus → **ZikaTeam** (`/zikateam`) : espace privé, accessible sur téléphone et ordinateur
- **Ma fiche** : identité, pôles et responsables, charte officielle, prochains rendez-vous, activation des notifications associées
- **Mon agenda** : réunions, stands, permanences, montage et missions ; réponse « Présent », « Absent » ou « À confirmer », inscription aux créneaux
- **Discussions** : générale, par pôle ou par activité, après acceptation de la charte
- **Gestion des équipes** : administrateur pour tous les pôles, responsables pour leurs seuls pôles ; gestion de la composition, activités, créneaux, tâches, pointage, réponses et journal d'administration
- **Secrétariat** : rôle transversal attribué ou révoqué exclusivement par l’administrateur ; consulte toutes les feuilles de présence publiées, réalise les pointages, imprime les feuilles d’émargement et exporte les listes CSV, sans pouvoir modifier les pôles, équipes, bénévoles ou convocations

L'administration crée les bénévoles, nomme les responsables et attribue le rôle Secrétariat depuis l’onglet « Bénévoles ». Un responsable peut éditer son pôle, en gérer les membres, créer des activités pour ses pôles seulement, attribuer des tâches et pointer les présences. Il ne peut pas se nommer administrateur, affecter un autre pôle ou cibler toute l'association.

L'ancien schéma ZikaTeam de la migration `0004_zikateam_secure.sql` est conservé sous des tables `*_legacy`. Les anciens bénévoles, affectations, messages, réunions et réponses sont repris dans le nouveau modèle sans supprimer les originaux. Contrôler les effectifs et les journaux d'import avant toute ouverture aux utilisateurs.

La suppression d'un pôle est une **archive réversible** pour préserver les historiques. La version de charte est immuable : toute nouvelle version doit être explicitement acceptée. Les documents acceptés sont des PDF de maximum 8 Mo, conservés dans R2 privé et servis uniquement aux personnes autorisées.

## Connexion gratuite pour tous (Supabase Auth + SMTP gratuit)

La branche de test utilise **`TEAM_AUTH_PROVIDER=supabase`**. À la première connexion (ou après oubli du mot de passe), les participants vérifient leur adresse e-mail avec un **code de six ou huit chiffres**, puis définissent un mot de passe personnel d'au moins 12 caractères avec lettres et chiffres. Les connexions ultérieures utilisent **e-mail + mot de passe**, sans envoi systématique d'e-mail. La session est conservée dans des cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Supabase Auth conserve et vérifie les mots de passe ; la base D1 n'en stocke jamais la valeur, seulement la date de configuration. Chaque appel privé est vérifié puis filtré avec les rôles D1 ; créer son mot de passe ne vaut jamais approbation de la demande d'accès par l'administration.

**Aucune limite de 50 membres** : le projet Supabase `ZikaMansle-Programme` existe déjà et l'offre Free comprend 50 000 utilisateurs actifs par mois à la date du 11 novembre 2026. Les quotas gratuits, dont 500 Mo de base et la mise en pause des projets inactifs, restent applicables. Le Worker Cloudflare et sa base D1 restent utilisés pour l'organisation ; seul l'authentificateur change.

**Envoi gratuit des codes avec la boîte Gmail existante de ZikaMansle (aucun nouveau compte Brevo nécessaire) :**

1. Utiliser l'adresse Gmail existante de l'association comme expéditeur et identifiant SMTP. Vérifier que la **validation en deux étapes** est activée sur le compte Google. Créer un **mot de passe d'application dédié** à Supabase dans les paramètres de sécurité du compte, si cette fonction est disponible. Ne jamais communiquer ce mot de passe dans un chat ni le stocker dans GitHub.
2. Dans le projet Supabase `ZikaMansle-Programme` → Authentication → **SMTP Settings**, activer **Custom SMTP**, puis saisir `smtp.gmail.com`, port `465` (TLS implicite) ou `587` (STARTTLS), identifiant Gmail et mot de passe d'application. Nom expéditeur : `ZikaMansle` ; e-mail expéditeur : l'adresse Gmail réelle de l'association. Le serveur SMTP fourni par Gmail est soumis aux limites d'envoi et règles d'utilisation Google : **ne pas promettre l'absence de restrictions**.
3. Dans Supabase → Authentication → Email Templates → **Magic Link**, personnaliser le modèle pour afficher `{{ .Token }}` afin d'envoyer le **code à six chiffres** plutôt qu'un simple lien. Les projets Free créés après le 3 juin 2026 ne permettent plus la personnalisation des modèles tant qu'un SMTP personnalisé n'est pas configuré. La connexion via Gmail SMTP permet cette personnalisation.
4. Vérifier dans Supabase que le fournisseur Email est activé et que la création de comptes est autorisée : le Worker ne demande un code que pour les e-mails figurant dans `team_members` (ou l'e-mail administrateur `ADMIN_EMAIL`), sans ouvrir l'accès de ZikaTeam aux autres comptes Supabase.
5. Les variables **publiques** `TEAM_SUPABASE_URL` et `TEAM_SUPABASE_PUBLISHABLE_KEY` reprennent les valeurs déjà présentes dans `public/config.js`. Ne jamais remplacer la clé publishable par une clé `service_role`.
6. Annuler le formulaire de création d'une nouvelle application **Cloudflare Access** pour `/zikateam*` ou supprimer cette **seule application ZikaTeam** si elle a déjà été créée ; sinon elle bloquerait la connexion de la majorité des bénévoles. **Conserver l'application Access existante `/administration/notifications`**. Les autorisations admin / responsables / secrétariat / bénévoles sont toujours gérées dans ZikaTeam.
7. Sauvegarder et migrer D1 avant publication : la table `team_auth_attempts` (migration 0104) limite les demandes et essais de connexion. Tester le code sur une adresse de membre volontaire avant de donner l'accès au public.

Le service d'e-mails intégré de Supabase **ne peut pas** envoyer des codes à tous les bénévoles : il est limité aux adresses de l'équipe Supabase et à 2 e-mails/heure. Le SMTP Google existant est une solution sans nouveau compte fournisseur ; le compte Gmail demeure soumis aux quotas, aux règles anti-spam et à la possibilité de refus ou blocage de messages. En cas de limitation de Google, une autre solution SMTP sera à envisager.
**Sécurité :** pas d'inscription libre dans ZikaTeam, demandes de codes contrôlées par l'existence d'une fiche D1 active ; limite par e-mail et IP ; retour d'identité uniquement après validation par Supabase ; seules les activités pertinentes sont visibles ; chaque mutation exige une origine identique au site. Les cookies ne sont pas lisibles en JavaScript. La révocation d'un compte dans D1 lui retire immédiatement l'accès, même si sa session Supabase subsiste.


## Base, tests et déploiement

1. Sauvegarder D1 et R2 staging.
2. Appliquer en ordre les migrations D1 `drizzle/0100_zikateam.sql`, `drizzle/0101_team_operations.sql`, `drizzle/0102_zikateam_legacy_import.sql`, `drizzle/0103_zikateam_secretariat.sql`, puis `drizzle/0104_zikateam_free_auth.sql`. La commande `npx wrangler d1 migrations apply zikamansle-app-staging --remote` fonctionne après configuration des secrets et des identifiants du Worker de test.
3. Exécuter `npm ci`, `npm test` et `npm run build`. La compilation `build` est un dry-run, pas une publication.
4. Déployer la **branche cible de test**, sans pointer de domaine personnalisé et sans fusion avec `main`. Le workflow `deploy-staging.yml` reste verrouillé par la variable `ZIKA_DEPLOY_ENABLED` et ne se déclenche automatiquement que sur `migration/application-autonome`.
5. Vérifier depuis un téléphone puis un ordinateur : accès admin, accès responsable, **secrétariat** et bénévole, refus hors équipe, PDF, charte, présence, créneaux, messagerie, tâches et pointage. Vérifier la nomination et révocation du Secrétariat, les feuilles imprimables et l’export CSV.
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

## Émargement et rôle Secrétariat

L’administrateur peut nommer un ou plusieurs bénévoles au **Secrétariat**, sans leur donner accès à l’administration globale. Ce rôle donne un accès transversal limité aux **activités publiées** : liste des personnes convoquées, réponses « Présent / Absent / À confirmer », horodatage de pointage, export CSV et impression d’une feuille pour signatures manuscrites. Le Secrétariat ne voit pas les brouillons, les courriels de tous les bénévoles, les ordres du jour réservés, ni les tables d’administration et n’a pas le droit de créer ou modifier les pôles, les affectations, les chartes et les activités.

**Pointage numérique ≠ signature d’émargement** : le bouton « Pointer présent » atteste seulement une saisie de présence par l’utilisateur autorisé. Pour obtenir une signature, imprimer la feuille et faire signer manuellement. Les actions de pointage, nomination et retrait de fonction sont enregistrées dans le journal d’audit.
