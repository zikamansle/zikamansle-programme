# Notifications réellement intégrées à l'application Android ZikaMansle

## Ce qui a été préparé dans la branche `prepare/google-play-android-2026`

La version Android, indépendante du navigateur Web Push, dispose désormais d'un **point d'entrée Android natif**, d'un écran de consentement au premier lancement, de la demande de permission système `POST_NOTIFICATIONS`, d'un **canal de notification « Actualités du Festival ZikaMansle »**, du badge monochrome officiel « Z », et d'un `FirebaseMessagingService` capable de recevoir et afficher un message FCM avec un lien interne vers le festival.

Les autres fonctions (programme, plan, billetterie, favoris, etc.) continuent à s'ouvrir dans la Trusted Web Activity existante. Le système de notifications Web Push reste en place pour le site Web, indépendamment du canal Android FCM.

**Important : le code n'est pas encore une notification fonctionnelle de bout en bout.** Aucune configuration Firebase ni aucun serveur d'enregistrement de jetons FCM n'a été ajoutée : un téléphone ne peut donc pas encore recevoir un envoi depuis l'administration ZikaMansle. Une compilation Android ne vaut pas test de réception.

## Etapes obligatoires avant un test réel

1. Dans Firebase Console, créer (ou sélectionner) un projet contrôlé par l'association, et activer Cloud Messaging.
2. Enregistrer l'application Android avec l'identifiant **`fr.zikamansle.app`**. Pour tester le APK debug séparément, enregistrer également **`fr.zikamansle.app.debug`**, car la variante debug utilise ce suffixe.
3. Relever dans la configuration du projet les identifiants **publics** Android de Firebase (application ID, API key, sender ID, project ID). Le code les attend lors du build sous `ZIKA_FIREBASE_APP_ID`, `ZIKA_FIREBASE_API_KEY`, `ZIKA_FIREBASE_SENDER_ID`, `ZIKA_FIREBASE_PROJECT_ID` (variables d'environnement ou propriétés Gradle).
4. Implémenter, tester et déployer sur le **Worker de validation uniquement** `POST /api/native/subscribe`. Il devra enregistrer les jetons FCM de manière sécurisée, prévoir la désinscription, éviter les abus, et maintenir une base isolée.
5. Configurer côté Cloudflare un compte de service Firebase avec droit d'envoi FCM HTTP v1, dans un **secret Cloudflare**, puis raccorder les boutons administrateur à la file des appareils Android, en conservant la séparation tests / diffusion générale.
6. Fournir `ZIKA_NATIVE_REGISTRATION_URL=https://zikamansle-app-staging.zikamansle.workers.dev/api/native/subscribe` au build Android **de validation**, et vérifier que les abonnements se créent bien. Cette URL n'est pas définie par défaut et le code refuse d'envoyer un jeton vers une autre adresse.
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
