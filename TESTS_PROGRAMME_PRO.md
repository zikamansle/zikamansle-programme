# Programme public : présentation et fluidité — 2 novembre 2026

Cette proposition s'appuie sur la version `a027e03` et conserve les données existantes. La production n'a pas été modifiée pendant la préparation.

## Changements

- Bannière plus légère : typographie moins imposante, introduction sur deux lignes, version mobile compacte et voile clair pour sa lisibilité. Les textes, images, couleurs et positions enregistrés restent conservés dans la base ; les réglages individuels du Studio restent prioritaires sur les styles généraux.
- Journées, recherche et principales catégories immédiatement disponibles. Catégorie complète, discipline, public, prix, période et dates sont regroupés dans Plus de filtres. Le tri reste visible près du nombre de résultats.
- Filtres actifs affichés et retirables un par un. Tout effacer réinitialise aussi la période, les dates et la sélection du lieu. Un intervalle de dates conserve les événements déjà commencés mais encore en cours.
- Cartes uniformisées : une couverture, date/horaire, titre, résumé court, lieu, gratuit/payant, catégorie et actions. Les médias supplémentaires restent accessibles dans les fiches.
- Plan conservé à côté des événements sur grand écran ; sur mobile/tablette, une barre fixe donne accès au plan dans une fenêtre dédiée et aux favoris. Un clic sur un lieu ferme la fenêtre et affiche ses rendez-vous.
- Confirmations discrètes pour les favoris et la remise à zéro. Écran sans résultats avec action pour élargir la recherche. État de sélection exposé avec aria-pressed, compteur annoncé et focus restauré après fermeture des fiches.
- Planning chronologique repliable, dates lisibles en français, mention Toute la journée à la place de minuits artificiels.
- Fiches : médias et agrandissement conservés, contraste et lecture améliorés, navigation clavier contenue dans la fenêtre.
- Chargement : polices Google demandées seulement lorsqu'elles sont utilisées (Inter et Anton pour les données testées, au lieu du catalogue entier) ; police personnalisée configurée conservée. Images de cartes chargées paresseusement, décodage asynchrone, emplacement réservé et une seule couverture au lieu de toutes les galeries. Recherche temporisée à 120 ms.
- Les fichiers de présentation portent une version dans leur URL pour éviter de réutiliser une ancienne feuille de style en cache.
- Le bouton de billetterie de fin de page utilise la destination HelloAsso du concert si aucune URL globale n’est configurée.
- La logique d'ouverture de fiche, de partage, de calendrier et les liens de billetterie existants sont conservés. Le code du plan et la configuration Supabase ne sont pas modifiés.

## Tests sur copie isolée

La copie utilise un instantané de lecture des 25 réglages et des 13 fiches publiques actuelles. Le service REST de test bloque les écritures externes et les modifications de fiches.

| Contrôle | Résultat |
|---|---|
| Recherche Kamini | Une carte : Soirées Concert |
| Recherche sans correspondance | Message clair et retour à tout le programme, 13 cartes retrouvées |
| Tarifs | 1 rendez-vous payant ; 12 gratuits |
| Tri alphabétique | Ordre des titres contrôlé |
| Dates inversées | Message explicite |
| Dates 24–25 avril | Les 13 rendez-vous, expositions en cours incluses |
| Période Terminés puis Tout effacer | 0 puis 13 rendez-vous ; période réinitialisée |
| Favoris | Ajout/retrait et confirmation ; conservation après rechargement |
| Fiche Rencontres littéraires | Contenu complet, deux photos, agrandissement de la deuxième et fermeture |
| Focus | Retour au bouton Découvrir après fermeture de la fiche |
| Plan mobile | Ouverture ; choix Salle Gautier Capuçon ; fermeture ; 2 rendez-vous et filtre de lieu visible ; iframe remise à sa place |
| Mobile 390 et 360 px | Pas de débordement horizontal ; grille à une colonne et barre de plan accessible |
| Tablette 768 px | Largeur intérieure 753 px, aucun débordement ; deux colonnes de cartes |
| Studio | Sélection de mots, couleur partielle, publication et annulation/republication testées sur la copie |
| Console et syntaxe | Pas d'erreur applicative relevée ; scripts vérifiés et git diff --check valide |

Les tests de partage natif et de téléchargement calendrier n'ont pas été rejoués ; leurs fonctions restent inchangées. Le temps de chargement réel dépend du réseau et des médias ; aucun gain chiffré n'est avancé. Déploiement en attente de l'accord demandé.

## Proposition visuelle enrichie après retour utilisateur

- Palette blanc cassé, bleu profond et orange, bordures plus fines et arrondis réduits. En-tête restructuré avec logo et identité, navigation sobre et bouton Billetterie HelloAsso visible sur ordinateur et mobile.
- Bannière plein écran en largeur conservant l’illustration Wix existante. Composition rééquilibrée, date, titre et introduction ; trois musiciens vectoriels animés alignés sur le cadrage exact du pont et notes musicales. Pause/reprise disponible ; version fixe pour la préférence de réduction des mouvements.
- ZikaRun : nouvelle fiche gratuite, en ligne, visuels existants du dépôt officiel zikarun2 et lien https://zikamansle.github.io/zikarun2/ ouvert et vérifié. Bouton Jouer en ligne sur la carte et dans la fiche. Aucune date artificielle ni lien vers le plan pour cette activité ; l’accès permanent est identifié séparément.
- Types de lieu dans l’administration et les filtres publics : lieu du festival, Dans toute la ville, En ligne et Hors de Mansle. Hors de Mansle conserve un champ ville/lieu libre ; aucun point, aucun lien vers le plan. Un itinéraire externe apparaît seulement si une URL d’itinéraire est renseignée. Le jeu de piste est proposé Dans toute la ville.
- PROPOSITION_PROGRAMME.json décrit uniquement la fiche à ajouter et les champs ciblés à modifier après accord. Il n’est jamais exécuté par le site. Les données de production ne sont pas modifiées. Les anciens réglages et les autres fiches restent conservés ; aucune fiche de marché n’est inventée ou publiée.

Contrôles supplémentaires sur la copie isolée : 14 fiches dont ZikaRun ; ouverture de sa fiche et présence du lien Jouer ; filtre En ligne + En cours = ZikaRun ; filtre Dans toute la ville = jeu de piste ; sauvegarde temporaire d’un lieu Vars — marché de Noël, relecture après rechargement et absence de lien au plan, puis restauration de ZikaRun en ligne via le formulaire ; bouton de billetterie et sa destination ; pause/reprise de l’animation ; mobile 390 px (375 px intérieurs), aucun débordement, billetterie visible ; ouverture/fermeture du plan mobile. Aucun nouvel échec applicatif relevé après correction d’un contrôle manquant dans le formulaire.

Le mock a été étendu pour permettre les sauvegardes de fiches dans le stockage local de QA uniquement. Tout envoi externe non GET/HEAD reste bloqué. Les opérations de suppression ne sont pas activées dans ce mock. La copie est destinée à la revue utilisateur ; aucune publication de production n’est effectuée.

## Complément : avant-festival, visibilité du plan et rapprochement de l’accueil

La proposition suivante est préparée après la publication de la première version, sans modifier à nouveau la production.

- Tout le programme, Avant le festival, Samedi 24 avril et Dimanche 25 avril : le premier choix conserve l’intégralité des fiches. Avant le festival utilise les dates réelles ; une exposition commencée avant le week-end reste visible pendant celui-ci si elle est toujours en cours. Une activité en ligne permanente reste accessible dans chaque période. Un marché de novembre n’est plus classé dans le week-end d’avril à cause d’un ancien champ day=samedi.
- Plan du festival dans l’en-tête, à côté de Billetterie, ouvrant la fenêtre du plan sur mobile et faisant défiler vers la carte sur ordinateur. Repère orange et titre renforcé pour la carte ; plan intégré plus haut sur grand écran. Barre fixe mobile conservée.
- Comparaison visuelle directe avec la page d’accueil officielle : titre Anton centré, date orange, bleu #1D3557, orange #EE591E et fond crème. La proposition conserve l’illustration existante du pont.
- Quatre artistes, mouvements différenciés, notes, trois feux d’artifice bleus et orange avec lancements et explosions espacés. Animation vectorielle légère, bouton pause/reprise, version fixe et réduction des mouvements. Ressources animées versionnées pour éviter l’ancien cache.
- Mobile : composition du pont décalée sous les textes ; scène animée recalée sur les coordonnées de l’image. En-tête à deux niveaux pour rendre les boutons Plan et Billetterie visibles sans débordement.

Validation : Avant le festival affiche les trois expositions, le jeu de piste et ZikaRun ; Tout le programme retrouve les 14 fiches ; samedi/dimanche utilisent les intervalles réels. Tests ciblés exécutables avec node tests/programme-periods.test.cjs : marché hors saison, exposition traversant les dates du festival, activité du samedi seulement, activité permanente et date non précisée. Plan mobile ouvert et refermé depuis le nouveau bouton ; écran 360 px (345 px intérieurs) sans débordement. JavaScript, SVG et git diff --check vérifiés. Les paramètres de bannière sont préparés dans PROPOSITION_PROGRAMME.json uniquement ; ce fichier n’est pas exécuté automatiquement et ne réimporte aucune fiche. Mise en production en attente d’accord.
