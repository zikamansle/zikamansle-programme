# Vérifications de sortie Android et Google Play

Chaque case doit être cochée **après essai effectif** ; aucun test n'est présumé réussi.

## Source et marque
- [ ] Identifier la version finale du code actuellement utilisée par les visiteurs
- [ ] Vérifier le domaine officiel de l'app et son certificat HTTPS
- [ ] Vérifier que le manifeste servi appartient bien à cette version
- [ ] Vérifier l'icône principale (tête officielle de Zika) sur écran d'accueil, splash et Play Store
- [ ] Vérifier l'icône des notifications (Z) et l'affichage réel sur Android
- [ ] Éviter toute adresse de prévisualisation « chatgpt.site » dans la version publique

## Fonctionnement
- [ ] Ouverture rapide, sans écran blanc ni erreur de chargement
- [ ] Plein écran TWA, sans barre d'URL (Digital Asset Links vérifiés)
- [ ] Page d'accueil et navigation vers toutes les rubriques existantes
- [ ] Programme, horaires, lieux et fiches des activités
- [ ] Plan, zoom, points d'intérêt et navigation
- [ ] Favoris, partage et lien ICS/PDF si disponibles dans la version finale
- [ ] Billetterie HelloAsso et tous les liens externes testés
- [ ] Actualités et partenaires si présents dans l'application finale
- [ ] Notifications : autorisation, inscription, réception en arrière-plan et clic
- [ ] Test avec mode avion puis retour du réseau
- [ ] Cache et mise à jour du service worker
- [ ] Retour Android, navigation après mise en veille et relancement
- [ ] Petit écran, grand écran, changement d'orientation, police agrandie
- [ ] Android 16 et une version Android plus ancienne supportée

## Google Play
- [ ] Package Android choisi et figé
- [ ] targetSdk >= 36 dans l'AAB effectivement généré
- [ ] Clé d'upload conservée en privé et sauvegardée
- [ ] Signature Play App Signing configurée
- [ ] Fichier assetlinks.json public avec SHA-256 exact du certificat de signature de Google Play
- [ ] URL de confidentialité publique, correspondant aux pratiques réelles
- [ ] Déclaration « Sécurité des données » vérifiée pour chaque fournisseur et SDK
- [ ] Formulaire publicités, accès à l'application, public cible et classification de contenu validés
- [ ] Description, pays, catégorie, captures d'écran réelles et illustration promotionnelle
- [ ] AAB signé uploadé sur une piste de test
- [ ] Installation et tests par au moins un appareil réel
- [ ] Tous avertissements et blocages Play Console résolus
- [ ] Publication publique seulement après validation explicite

## Observations du 10/11/2026
La PWA `zikamansle-programme` contient `manifest.webmanifest`, des icônes de 192/512 px et `sw.js`. Son icône 512 actuellement accessible est le logo « Z », **pas la tête de Zika**. Le `sw.js` lu ne montre pas de gestionnaire `push`/ `notificationclick`. Ces éléments ne permettent pas de conclure à l'état de la version mobile qui fonctionne si celle-ci a été publiée ailleurs.
