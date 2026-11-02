# Studio : diagnostic et validation du 2 novembre 2026

Base examinée : `4d6eac0c19cbbb5033fa1dca75c34adb51ca3f4f`.
Aucune modification de main ni écriture Supabase de production pendant cette intervention.

## Défauts reproduits en production

- Connexion réelle au Studio, ouverture de l'éditeur et modification privée de la couleur du titre : la valeur changeait dans le panneau mais pas à l'écran. Essai annulé avant fermeture, sans publication.
- Console de l'iframe : `ReferenceError: customKey is not defined`, dans `buildCss` et `generate`, et avertissement « Personnalisation indisponible ».
- Lecture REST réelle : 43 entrées dans `visual_editor`, dont 21 marquées masquées. Les données existaient ; le rendu échouait.
- Inspection du code et des styles calculés : cibles `.hero`, `.hero h1` et sous-titre absentes de la liste du Studio ; couleurs de conteneurs et règles générales prioritaires sur les réglages individuels ; extraction des identifiants personnalisés retournant `zv-block` pour tous les blocs ; ancien titre pouvant remplacer un réglage plus récent.

## Correction

- Définition de `customKey` sur la page publique ; extraction des vrais identifiants et réconciliation des blocs lors des actualisations.
- Même priorité CSS dans Studio et public ; les couleurs individuelles passent avant les couleurs héritées de conteneurs, avec les règles mobiles conservées.
- Normalisation compatible des anciennes cibles dans les deux vues, sans effacer les données existantes. Un ancien masquage collectif `zv-block` reste appliqué aux blocs historiques ; les nouveaux blocs portent explicitement leur visibilité.
- Le document du Studio laisse son design au brouillon de l'éditeur : la lecture automatique du design publié ne réapplique plus une seconde couche qui perturbe Annuler.
- Suppression des anciennes écritures de typographie directement dans les styles inline, qui pouvaient survivre à une annulation.
- Publication : relecture intégrale du JSON enregistré, contrôle du rendu dans une autre iframe, puis invitation explicite à vérifier visuellement. Les cibles historiques introuvables restent signalées dans la console ; une cible modifiée introuvable bloque le contrôle. Les sélecteurs des fiches fermées ne sont pas contrôlables sur la page générale.
- Les textes inchangés ne sont plus réécrits à chaque observation du DOM ; un seul intervalle d'actualisation du design.

## Essais navigateur sur copie isolée

La copie est servie par l'aperçu de développement, avec une simulation REST persistante locale. Toute écriture externe et toute modification des fiches y sont bloquées. Le code corrigé est utilisé ; seule la configuration et l'entrée dans la copie d'administration sont adaptées pour les essais.

| Essai | Résultat observé |
|---|---|
| Couleur du titre | Changements vert, bleu et orange visibles ; vérification des couleurs calculées |
| Annuler / Rétablir | Retour à la couleur précédente puis réapplication de la nouvelle |
| Publication simulée | Écriture, relecture JSON et contrôle dans une iframe publique indépendante réussis |
| Actualisation publique sans rechargement | Un onglet déjà ouvert reçoit la nouvelle couleur |
| Rechargement de la page publique | Couleur et suppression du sous-titre conservées |
| Suppression d'un bloc ajouté | Masquage conservé dans la vue publique avec identifiant unique |
| Fermer puis rouvrir | Fermeture après sauvegarde sans faux avertissement ; couleur retrouvée |
| Rendu public visuel | Capture contrôlée après chargement du design : titre orange, éléments masqués absents |
| Préservation | 13 fiches publiques présentes et plan intégré présent ; plan.html, config.js et programme-initial.js inchangés |
| Vérifications statiques | Syntaxe des 13 scripts admin et 6 scripts publics ; git diff --check |

## Validation restant soumise à autorisation

L'écriture réelle du design corrigé dans Supabase et le déploiement GitHub Pages n'ont pas été effectués. La simulation ne prouve pas les autorisations d'écriture Supabase du compte réel. Après accord : fusionner la correction, attendre GitHub Pages, refaire les essais de sauvegarde/publication avec sauvegarde préalable et contrôler visuellement la vraie page publique. Les anciennes cibles de mise en page sans correspondance certaine ne sont ni supprimées ni remappées arbitrairement.
