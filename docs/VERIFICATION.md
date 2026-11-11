# Vérification — migration non terminée

État au 11 novembre 2026. Aucun changement du site publié, des DNS, des secrets en service ou des envois réels.

| Élément | Résultat |
|---|---|
| Source originale | Version 15, commit 95867159de7b0fd1a5ae8b9642c4794aa91d659b récupéré |
| Fichiers publics | Aucun manquant ; seuls menu Plus, lien de connexion et version du cache modifiés |
| Graphisme et médias intégrés | Octets des images/CSS/manifestes conservés |
| Tests | 14 tests réussis + contrôles du modèle : filtres, ICS, 17 pages, 25 logos/liens |
| Compilation Worker | Wrangler 4.160.0, dry-run réussi, 48 fichiers statiques |
| Authentification | Tests signature, propriétaire, émetteur, audience, expiration et rejet des en-têtes usurpés réussis |
| Envois de validation | Désactivés par défaut et verrou testés |
| Export D1 | 3 configurations, 3 abonnements, 19 notifications, 25 suivis ; aucune troncature signalée |
| Restauration D1 locale | SQLite : intégrité OK, comptes identiques |
| Supabase | 18 événements, 27 paramètres ; inventaire colonnes/contraintes/politiques exporté |
| Fonction externe | wix-media version 13 récupérée, non modifiée et non redéployée |
| Média de notification référencé | Un objet téléchargé via l'accès autorisé du propriétaire ; somme SHA-256 enregistrée |
| Stockage R2 complet | Non vérifié : objets non référencés non inventoriables avec les outils disponibles |
| Médias/liens externes | 175 URL répertoriées et références conservées ; téléchargement exhaustif et disponibilité non vérifiés |
| Aperçu navigateur | Non vérifié : démarrage Wrangler local bloqué par uv_interface_addresses dans cet environnement |
| GitHub | Branche dédiée migration/application-autonome créée dans zikamansle-programme ; dépôt distinct zikamansle-app non créé. Consulter le commit de la branche pour le code transféré. |
| Compte Cloudflare utilisateur | Non configuré, aucun déploiement distant |
| Clé privée VAPID actuelle | Masquée, non exportée ; obstacle à une reprise transparente des abonnements |
| Android réel | Réception et identité d'émetteur non vérifiées |

## Recette obligatoire avant toute bascule

- Comparaison visuelle mobile et bureau : accueil, programme, filtres, détails, favoris, partage, calendrier, plan/parcours, partenaires, rubriques, billetterie, Plus, installation et actualisation.
- Essai hors connexion et mise à jour du service worker sans perdre favoris ou abonnements.
- Connexion Cloudflare Access réelle : administrateur autorisé et autre compte refusé ; API privées protégées, flux publics accessibles.
- Import d'un média image/vidéo/PDF, actualité, test sur un seul appareil, accusés de réception, reprise d'un envoi et archivage.
- Relecture et comparaison des données D1 après import distant ; copie finale au moment de basculer.
- Vérification des objets R2, des médias Wix et des liens externes, notamment vidéos, ZikaRun, billetterie et programme.
- Récupération sécurisée et vérification de la clé VAPID originale avant tout changement d'origine de service.
- Tests sur Redmi Note 14 Pro 5G : nom, badge, réception en arrière-plan et écran verrouillé, clic vers l'application.
- Vérification Android/TWA/assetlinks selon le paquet Google Play réellement installé.
- Validation de la méthode de routage de app.zikamansle.fr, sans modification IONOS à ce stade ; retour arrière documenté et ancien site conservé.

Les tests automatiques utilisent des abonnements et des clés fictifs. Ils valident le protocole et la logique, pas la livraison effective par Android ni la configuration Cloudflare cible.
