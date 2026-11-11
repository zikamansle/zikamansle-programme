# Notifications réellement intégrées à l'application Android ZikaMansle

## Ce qui a été préparé dans la branche `prepare/google-play-android-2026`

La version Android, indépendante du navigateur Web Push, dispose désormais d'un **point d'entrée Android natif**, d'un écran de consentement au premier lancement, de la demande de permission système `POST_NOTIFICATIONS`, d'un **canal de notification « Actualités du Festival ZikaMansle »**, du badge monochrome officiel « Z », et d'un `FirebaseMessagingService` capable de recevoir et afficher un message FCM avec un lien interne vers le festival.

Les autres fonctions (programme, plan, billetterie, favoris, etc.) continuent à s'ouvrir dans la Trusted Web Activity existante. Le système de notifications Web Push reste en place pour le site Web, indépendamment du canal Android FCM.

**Important : une notification réelle n'a pas encore été reçue.** Le projet Firebase `zikamansle-d0c4e` et l'application Android de test `fr.zikamansle.app.debug` sont enregistrés. Les identifiants clients publics sont intégrés uniquement à l'APK debug (pas de `google-services.json` dans GitHub). Le Worker Cloudflare de staging comporte désormais `POST /api/native/subscribe` et les API privées `native-status` / `native-test` dans l'administration. Le dernier composant manquant est **la clé de compte de service FCM pour envoyer depuis Cloudflare**, qui doit rester exclusivement dans un secret Cloudflare `FCM_SERVICE_ACCOUNT_JSON`. La réception réelle sur Redmi reste à vérifier.

## Etapes obligatoires avant un test réel

1. Dans Firebase Console, créer (ou sélectionner) un projet contrôlé par l'association, et activer Cloud Messaging.
2. Enregistrer l'application Android avec l'identifiant **`fr.zikamansle.app`**. Pour tester le APK debug séparément, enregistrer également **`fr.zikamansle.app.debug`**, car la variante debug utilise ce suffixe.
3. **Fait pour l'APK debug uniquement :** identifiants publics configurés dans `android-native/app/build.gradle`. Le fichier original `google-services.json` ne doit pas être publié. La release reste non configurée.
4. **Fait côté staging :** `POST /api/native/subscribe` enregistre les jetons Android dans une table D1 isolée avec limite anti-abus. La suppression explicite de l'abonnement serveur et une protection renforcée (App Check) restent à traiter avant ouverture au public.
5. **À faire dans Cloudflare :** générer une clé privée de compte de service Firebase et la placer directement dans le secret `FCM_SERVICE_ACCOUNT_JSON` du Worker `zikamansle-app-staging`. Ne jamais la partager dans le chat ni GitHub. L'interface administrateur de staging est déjà reliée au test Firebase : l'envoi général reste interdit.
6. **Déjà configuré pour l'APK debug :** `ZIKA_NATIVE_REGISTRATION_URL=https://zikamansle-app-staging.zikamansle.workers.dev/api/native/subscribe`. Il reste à vérifier une inscription réelle après installation sur le Redmi.
7. Tester sur un vrai Android : consentement utilisateur, notification au premier plan, arrière-plan et écran verrouillé, icône de Zika et ouverture directe de l'actualité.
8. Une fois l'envoi complètement vérifié, préparer un AAB signé dans la piste **Google Play test interne**, jamais en production sans décision explicite. Attention à l'identité exacte de l'application déjà installée et aux certificats de signature.

Le projet de validation doit rester distinct du site `app.zikamansle.fr`. Aucun DNS, aucune application en production, aucune clé Play, aucun compte Firebase ni aucune clé VAPID de production n'a été modifié par cette préparation.

## Sécurité et compatibilité

- Un utilisateur qui refuse les notifications peut continuer à utiliser l'application.
- Sans configuration Firebase, l'application reste accessible et ne demande pas une permission inutile.
- Les jetons Firebase ne sont jamais affichés dans les journaux et ne sont pas enregistrés dans GitHub.
- Les liens d'ouverture reçus sont limités à l'origine HTTPS de l'application configurée.
- Les notifications Android FCM et Web Push sont des systèmes distincts ; les abonnements ne sont pas interchangeables.
- Le projet natif nécessite encore une **compilation Gradle réussie et un test réel sur téléphone** avant livraison.
- Tant que Firebase et le backend ne sont pas prêts, **ne pas publier la branche Android**.
