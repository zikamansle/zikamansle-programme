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
