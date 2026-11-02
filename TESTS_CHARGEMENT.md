# Chargement du design public — 2 novembre 2026

## Problème observé

L'enregistrement vidéo montre le HTML/CSS de base brièvement visible avant l'application du design enregistré. La page lisait séparément les réglages généraux, l'ordre des sections, la bannière et le design visuel. Ces réponses pouvaient arriver dans un ordre différent et exposer plusieurs états intermédiaires.

## Correction

- Un état de chargement est posé dans le head avant le premier affichage. Le contenu n'est révélé qu'après l'initialisation des événements et des quatre étapes de personnalisation.
- Les étapes utilisent une même réponse initiale pour les réglages Supabase. Les lectures ultérieures du design restent fraîches et conservent le fonctionnement de la publication et de l'actualisation.
- Une dernière application du design intervient après les réglages généraux et la structure de page ; les polices et médias de couverture disposent d'une attente bornée avant la première révélation.
- Le Studio révèle son iframe après l'application de son brouillon, sans exposer le design de base entre les deux.
- Une erreur initiale affiche un message avec Réessayer, sans révéler une apparence de repli. Les requêtes initiales sont interrompues au bout de 10 secondes, et la page peut être rechargée pour réessayer.
- Le message de confirmation de publication attend lui aussi la fin du chargement public ; il n’est plus envoyé depuis un état intermédiaire.
- Aucune modification des fiches, du plan, des réglages ni de la configuration Supabase.

## Vérification navigateur isolée

La copie de test utilise une simulation REST locale qui interdit les écritures externes. Une instrumentation passive, uniquement dans la copie, échantillonne chaque image d'animation, la visibilité du corps et le titre affiché.

- Deux rechargements avec 1,2 seconde de retard réseau simulé : aucune image avec le titre de base visible ; premier titre visible « programme interactif », conforme au design enregistré. Mesures : 0 image de base visible sur 67 puis 85 images observées.
- Ouverture du Studio : contenu visible après application du brouillon, titre enregistré retrouvé.
- Échec réseau simulé : message et bouton Réessayer présents ; contenu de base invisible (24 images masquées, aucune image de base visible).
- Première tentative échouée puis clic sur Réessayer : page correctement chargée, aucun écran d'erreur restant ; aucune image de base visible.
- Publication simulée depuis le Studio après sélection partielle colorée : écriture, relecture et confirmation de la page prête réussies ; 13 fiches publiques et le plan restent présents.
- Syntaxe JavaScript des deux pages et git diff --check valides.

La mise en production reste soumise à l'accord demandé. Les tests ci-dessus ne modifient pas les données en ligne.
