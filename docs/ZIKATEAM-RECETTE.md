# ZikaTeam — matrice de recette avant ouverture

État du code : branche `feat/zikateam-fiches-notifications`, développement isolé de la production.

Cette matrice distingue **fonction codée** et **test utilisateur réel**. Une case non validée interdit de prétendre que la fonctionnalité fonctionne sur le téléphone.

| Fonction demandée | Code | Vérification réelle obligatoire |
| --- | --- | --- |
| Déjà membre : e-mail + mot de passe | Présent | Connexion à deux appareils et session persistante |
| Première inscription : nom, prénom, e-mail, OTP | Présent | Réception code e-mail, invalidation du code erroné |
| Mot de passe personnel après OTP | Présent | Première connexion, oubli du mot de passe, reconnexion |
| Mise en attente et approbation admin | Présent | Deux comptes fictifs : accepter / refuser |
| Aucun accès interne avant approbation | Présent | Messages, annuaire, photos, PDF et API refusés |
| Charte et acceptation horodatée par version | Présent | Signature de la charte, changement de version |
| Consentements séparés : image, téléphone, e-mail | Présent | Oui/Non, modification, retrait effectif |
| Téléphone modifiable sur Ma fiche | Présent | Un bénévole approuvé modifie son propre numéro |
| Partage e-mail/téléphone aux responsables uniquement | Présent | Responsable de deux pôles / autre bénévole |
| Photos internes soumises au droit à l'image | Présent | Oui/Non, suppression de consentement, cache |
| Création, modification, suppression ou archivage des pôles | Présent | Pôle vide et pôle contenant des données |
| Affectation des membres et responsables | Présent | Ajouter, déplacer, retirer une personne |
| Fiche bénévole : rôles, pôles, responsables, prochaines missions | Présent | Comparaison des droits par rôle |
| Réunion / stand / permanence / mission | Présent | Créer, publier, modifier, annuler |
| Destinataires : tous, responsables, bureau, pôles choisis | Présent | Vérifier que seules les bonnes personnes reçoivent la convocation |
| Ordre du jour, informations pratiques, PDF | Présent | Téléversement et refus d'accès hors public |
| Réponse présent / absent / à confirmer | Présent | Choix et mise à jour |
| Créneaux et inscriptions limitées par capacité | Présent | Deux bénévoles sur dernier créneau |
| Tâches assignées / progression | Présent | Modification par destinataire et interdiction hors rôle |
| Discussions générale, par pôle, par mission et responsables | Présent | Aucun accès hors public et aux demandes en attente |
| Secrétariat dédié, sans droits administrateur | Présent | Nominations, suppression de rôle, annuaire et adhésions |
| Émargement : objet, date/heure, lieu, qualité | Présent | Création, affichage, modification du groupe des présents |
| Ajout ultérieur des présents | Présent | Ajout après création de la feuille |
| Signature manuscrite directement sur écran | Présent | Doigt sur téléphone et souris sur ordinateur |
| Conservation, consultation, clôture des émargements | Présent | Signature retrouvée après reconnexion |
| Impression/PDF avec signatures tracées | Présent | Contrôle de rendu A4 et PDF imprimé |
| Export CSV listes, adhésions, émargements | Présent | Tableur et accents français |
| Couleurs et ergonomie mobile ZikaTeam | Présent | Contrôle visuel Redmi + ordinateur |
| Push ciblés et rappels de réunions | Présent, envoi désactivé | Test volontaire isolé avant toute diffusion |

## Contrôles déjà réalisés sans publier

- Vérification de syntaxe JavaScript des sources serveur et interface : **OK**.
- Vérification statique des nouveaux garde-fous d'accès, consentement et signatures : **OK**.
- Mise à jour des tests SQL et authentification pour les règles actuelles ; **exécution complète npm test non confirmée**.
- Base de données D1 de staging : migrations jusqu'à `0113` présentes ; ne pas la réinitialiser.
- Le Worker staging visible dans le navigateur sert une ancienne interface ; **le code actuel n'est pas déployé**.

## Sécurité de déploiement

Ne pas déployer, fusionner vers `main`, modifier `app.zikamansle.fr`, modifier les DNS ou activer les notifications de groupe avant la recette complète. Ne jamais utiliser de données personnelles de bénévoles pour les tests automatiques.

## Corrections intégrées après inventaire

- La génération des rappels ne dépend plus du paramètre `TEAM_ACCESS_AUD` lorsque la connexion utilise Supabase.
- `APP_ENV=staging` interdit explicitement l'émission de notifications et de rappels, même si un commutateur d'envoi était activé par erreur.
- Un workflow indépendant `.github/workflows/test-zikateam-feature.yml` lance `npm ci`, `npm test` et la compilation sèche à chaque mise à jour des sources ZikaTeam, **sans secret Cloudflare ni déploiement**.
- Tests supplémentaires des règles de confidentialité et de l'interdiction des notifications staging.

**Attention :** l'existence d'un workflow ne constitue pas une preuve que ses exécutions ont réussi. Son résultat doit être consulté dans l'onglet Actions de GitHub avant validation.

## Ajouts de l'éditeur avancé — branche de développement

- Migration additive `0114_team_saved_lists.sql` : modèles de listes enregistrés dans D1 staging **après le prochain déploiement autorisé**, sans toucher aux données existantes.
- Création / modification / suppression d'une liste privée réservées aux membres ayant les droits **administration** ou **secrétariat**.
- Sélection individuelle des participants, filtres, ordre des personnes et ordre des colonnes ; choix des colonnes à afficher.
- Sauvegarde du titre, des IDs des membres et des colonnes ; réouverture ultérieure de la liste ; impression PDF via dialogue d'impression et export CSV.
- Boutons Retour / Annuler sur les formulaires d'édition des pôles, activités, bénévoles, créneaux, listes, contacts, adhésions, tâches et charte.
- Signature : bouton Faire signer pour un participant ajouté, affichage plein écran, demande native d'orientation paysage, affichage horizontal de secours quand l'API est refusée, boutons Recommencer / Valider / Retour sans enregistrer.
- Contrôles statiques récents : syntaxe JavaScript valide et aucune des 65 familles de boutons `data-*` relevées n'est sans gestionnaire détecté. **Ce contrôle ne prouve pas leur fonctionnement sur téléphone**.
- Tests SQL automatisés ajoutés pour créer, modifier, retrouver et supprimer les listes avec contrôle des droits ; vérification réelle des tests `npm test` encore nécessaire.
- L'environnement du conteneur ne peut pas joindre github.com ; aucun clone local n'a pu servir à exécuter `npm test` dans cette session.
- Les migrations de listes ne sont pas appliquées à la base distante tant que le staging n'est pas déployé. Ne pas annoncer la fonctionnalité comme disponible sur l'URL de test avant cette étape.
