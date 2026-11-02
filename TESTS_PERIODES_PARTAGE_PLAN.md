# Périodes, partage avec visuel et localisation — proposition après publication

## Périodes administrables

Le formulaire de fiche propose un classement automatique ou des choix multiples : Avant le festival, Samedi 24 avril, Dimanche 25 avril. La liste extra.programme_periods est indépendante des dates réelles ; elle est prioritaire pour les choix du week-end. Toute activité datée avant le 24 avril 2027 reste aussi automatiquement dans Avant le festival, même si ses choix manuels ne cochent pas cette période. Les activités en ligne permanentes y restent également. Une sélection manuelle vide est refusée. Le mode automatique reste le défaut des fiches existantes.

La proposition de données contient uniquement deux modifications ciblées : concours photo avant le festival, ZikaRun avant + samedi + dimanche. Le concours photo reste en brouillon ; la remise des prix est une autre fiche et reste intacte. Aucune fiche ne doit être publiée implicitement.

Tests sur copie isolée : sauvegarde de ZikaRun avec Avant uniquement, rechargement public, absence du samedi et présence dans Avant ; restauration des trois périodes ; erreur explicite pour une sélection vide ; concours photo non publié. Tests unitaires : node tests/programme-periods.test.cjs.

## Partage

Le bouton ouvre un écran présentant l’image principale de la fiche et son lien direct. Priorité image principale, puis miniature, puis première photo de galerie. Les navigateurs compatibles avec le partage de fichiers reçoivent le fichier image et le lien dans le texte ; les autres disposent de Copier le lien et Télécharger le visuel. Les formats autres que PNG/JPEG sont convertis en PNG pour le partage. Les URL temporaires sont révoquées et les erreurs réseau disposent d’une solution manuelle.

Tests navigateur : visuel principal des Rencontres littéraires affiché et préparé, téléchargement réel de l’image, copie du lien avec confirmation. Le partage natif de fichier dépend du navigateur et de l’application destinataire ; il n’a pas été testé sur un téléphone physique. L’aperçu automatique d’un lien seul sur les réseaux sociaux n’est pas modifié par ce correctif : sur ordinateur, l’image doit être jointe au lien à l’aide du téléchargement proposé.

## Situer sur le plan

Cause reproduite sur la page publique : les liens passaient lieu=4 mais le plan ne traitait que lieu=parade, sans surligner les repères numérotés. Les cinq repères sont maintenant sélectionnés et nommés, avec un zoom automatique à 250 % et un centrage dans la zone de carte. Le parcours de parade reste une vue d’ensemble. La sélection initiale d’un lien ne diffuse pas un clic de lieu vers le programme : elle ne ferme donc pas immédiatement la fenêtre mobile et ne filtre pas les cartes. Les clics volontaires sur les repères conservent leur fonction de filtrage.

Depuis une fiche détaillée, le lien ferme la fiche et ouvre le plan intégré au bon lieu. La carte intégrée masque ses titres redondants et ajuste sa hauteur disponible. La carte autonome conserve sa présentation. Les fichiers de plan portent une version dans leur URL pour éviter un ancien code en cache. Les lieux personnalisés peuvent être relus dans les paramètres existants ; les coordonnées de base et l’illustration sont conservées.

Tests navigateur : Médiathèque sélectionnée en repère 4, nom affiché, zoom 250 %, carte maintenue ouverte sur mobile depuis la carte événement et depuis la fiche détaillée. L’ouverture de localisation conserve les 14 cartes publiques ; fermeture de la fiche avant ouverture du plan vérifiée. Aucun nouvel envoi de données en production pendant la préparation.

Contrôles : syntaxe JavaScript, tests de périodes, diff sans erreurs d’espaces ; illustration de base conservée. Modifications soumises à validation avant déploiement.

Précision validée pendant le déploiement : le classement avant le 24 avril est toujours inclusif. Tests supplémentaires : exposition avant avril avec choix manuel samedi, marché hors saison avec choix dimanche, activité permanente avec choix samedi et créneaux non ordonnés.
