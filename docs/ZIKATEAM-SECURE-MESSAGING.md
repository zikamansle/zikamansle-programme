# ZikaTeam — espace privé des bénévoles ZikaMansle

## Objectif
Intégrer à l'application ZikaMansle une zone `/zikateam`, distincte de la consultation publique. Les bénévoles invités pourront échanger en messagerie générale et dans les salons de leur pôle, partager des informations pratiques, consulter des documents internes et organiser les réunions dans un agenda privé.

**Statut : cadrage préparatoire, aucune messagerie publique ni accès bénévole activé.** Développement et essais uniquement sur `zikamansle-app-staging` avant validation.

## Sécurité obligatoire
1. **Connexion personnelle** par e-mail avec authentification sécurisée gérée par Cloudflare Access (code à usage unique ou méthode administrée). Aucun mot de passe partagé entre bénévoles. La liste des comptes acceptés est gérée séparément par l'association.
2. **Contrôle des accès côté serveur** : valider la signature, l'émetteur, l'audience et l'expiration du JWT Access à chaque requête ; comparer l'adresse e-mail vérifiée à une liste interne d'adhésions actives. Aucun accès via un simple paramètre URL, JavaScript client, cookie non vérifié ou nom d'utilisateur librement déclaré.
3. **Rôles** : administrateur ZikaMansle (gestion et révocation), référent de pôle (salon de son pôle), bénévole (salons auxquels il est affecté). Invitations, rôles et suppressions réservés aux administrateurs.
4. **Salons** : une conversation **Général ZikaTeam** accessible à tous les membres autorisés, et une conversation distincte par pôle (logistique, artistes, buvette, accueil/billetterie, parade, décoration, communication, etc.). L'appartenance est contrôlée **pour chaque lecture, ajout, modification et suppression de message**, jamais seulement à l'affichage.
5. **Réunions** : agenda privé avec date/heure, lieu, ordre du jour, documents et réponses « présent / absent / à confirmer ». Réunions générales accessibles à tous, réunions de pôle réservées aux membres de ce pôle. Création par administrateurs et référents autorisés ; rappels privés après rattachement sécurisé des appareils.
7. **Données personnelles** : collecter le minimum (e-mail, pseudonyme choisi, rôle, affectations) ; définir une durée de conservation, l'export/suppression, la gestion des départs et l'information RGPD avant ouverture. Pas de données sensibles ni de listes personnelles dans les journaux.
7. **Messagerie** : valider les longueurs, limiter le débit et la taille des requêtes ; afficher les contenus utilisateur en texte échappé (protection XSS) ; identifiants de messages aléatoires ; journal d'administration limité aux actions nécessaires ; anti-spam et modération.
8. **Fichiers** : accès authentifié sur chaque téléchargement et dépôt ; stockage privé R2, pas d'URL publique devinable ; limites de taille/type ; vérifier les contenus et protéger contre les abus avant d'ouvrir l'envoi de pièces jointes.
9. **Notifications ciblées** : ne pas réutiliser l'abonnement de test Firebase anonyme ou la diffusion publique. Rattacher chaque jeton Android à une identité authentifiée et recueillir le consentement. Par défaut, ne pas transmettre le texte privé d'un message sur l'écran verrouillé : seulement « Nouveau message ZikaTeam ».
10. **Transport et session** : HTTPS, `Cache-Control: no-store` pour toutes les pages/API privées, pas d'informations de session dans l'URL ou le `localStorage`, révocation effective des accès des bénévoles désactivés.
11. **Tests de sécurité** : un visiteur non connecté obtient 401/403, un compte non invité 403, un bénévole ne peut lire un salon auquel il n'appartient pas, un ancien membre est refusé, un référent ne peut modifier les rôles, aucune notification ne fuit à une autre personne.

## Architecture envisagée
- Cloudflare Worker existant : routes privées `/zikateam` et `/api/zikateam/*`.
- Cloudflare Access : politique de connexion des membres + JWT signé validé par le Worker, audience spécifique si nécessaire.
- Base D1 staging existante : membres approuvés, salons, affectations, messages, modération, lectures, réunions et réponses des bénévoles. Stockage privé R2 pour documents après validation.
- Firebase Cloud Messaging existant : uniquement les alertes privées à des appareils associés à un membre authentifié, dans un second temps.
- Interface web/mobile : navigation ZikaTeam après connexion, absente des pages publiques non connectées. Aucun contenu privé précaché par le Service Worker public.

## Phases et critères de passage
1. **Fondations** : comptes individuels, invitation/révocation, roles côté serveur, tests de refus par défaut.
2. **Messagerie et réunions** : conversation Général + salons par pôles, messages texte avec rafraîchissement simple, agenda des réunions générales et des réunions de pôle, confirmations de présence.
3. **Confort** : mentions, documents privés, notification de nouveau message, indicateurs non lus, optimisation mobile.
4. **Pilote** : quelques bénévoles consentants testent sur une copie de staging ; tests de séparation, comptes révoqués, notification et usage hors connexion.
5. **Publication** : uniquement après validations explicites et configuration des accès; ne jamais rendre publiques les conversations ni publier dans Google Play par simple ajout de code.

## Décisions à confirmer ultérieurement
- E-mails des premiers membres invités et répartition dans les pôles (pas dans le dépôt Git).
- Charte d'usage, règles de modération, responsable d'administration des comptes.
- Durée de conservation, export/suppression, gestion des départs.
- Si les messages privés individuels sont nécessaires au lancement, ou si les salons suffisent.
