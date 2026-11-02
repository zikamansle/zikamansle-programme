# Sélection de texte et bannière — 2 novembre 2026

Cette correction complète celle de la PR nº 1. Elle est préparée sans écriture dans Supabase de production.

## Problèmes

Le sélecteur de couleur changeait `color` pour le bloc entier, mais ne traitait pas une sélection de mots. La sélection du navigateur était perdue au clic dans le panneau et les blocs personnalisés ne restituaient pas le HTML enrichi. Les couleurs descendantes imposées par le design pouvaient aussi écraser les couleurs des mots.

La bannière principale conservait une largeur sauvegardée en pixels (1 180 px), créant une marge à droite sur un écran plus large.

## Comportement corrigé

- Un double-clic permet d'éditer un texte. Les mots sélectionnés conservent leurs offsets lors du passage au sélecteur de couleur ; seul ce passage reçoit la couleur choisie.
- Le HTML enrichi reste limité aux balises et couleurs autorisées et est restitué dans le Studio et sur la page publique, y compris pour les textes ajoutés.
- Une sélection repliée ou une nouvelle cible ne réutilise pas une ancienne plage par erreur. Annuler et Rétablir effacent aussi la plage mémorisée.
- Les sections `.hero` et `.zika-banner` occupent 100 % de leur parent ; leur ancienne largeur fixe et leur décalage horizontal n'imposent plus de bande vide. Les textes, la hauteur et le cadrage vertical restent enregistrés comme auparavant.
- Aucun changement de plan.html, des fiches événements ni de la configuration Supabase.

## Validation navigateur isolée

Une copie de l'application utilise une simulation REST persistante, avec écritures externes et modifications de fiches bloquées.

- Mot « Deux » recoloré en rose dans un paragraphe : le reste du paragraphe reste orange ; Annuler retire la couleur partielle, Rétablir la remet.
- Publication de ce HTML enrichi, puis lecture de la vue publique : seul le mot choisi est rose.
- Réédition d’un mot déjà coloré : le double-clic conserve le bloc de texte, sans recréer ses nœuds inutilement. Ajout d’une deuxième couleur (bleu) sur « texte » en conservant « Nouveau » rose ; Annuler retire la deuxième couleur et Rétablir la remet.
- Même test avec « Nouveau » dans un nouveau bloc « Nouveau texte » : le deuxième mot garde la couleur du bloc et la vue publique conserve le HTML enrichi.
- Bannière : largeur mesurée de 1 348 px pour une page de 1 348 px ; bord gauche à 0. Dans le Studio : 1 007 / 1 007 px ; mode mobile : 373 / 373 px.
- Contrôle automatique de publication de la copie réussi. Syntaxe JavaScript des deux pages et `git diff --check` valides.

Le déploiement réel et les écritures Supabase de production ne font pas partie de ces essais et restent soumis à l'accord demandé.
