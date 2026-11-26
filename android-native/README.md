# ZikaMansle — Android TWA (projet de compilation de TEST)

Le dossier contient un **vrai projet Android Gradle** pour fabriquer un APK de test. Il ne modifie **pas** le site Wix ni l'app Work déjà publiée.

## État de préparation — 11/11/2026
- La page Wix officielle vérifiée est https://www.zikamansle.fr/ .
- L'adresse cible de l'application ZikaMansle est **https://app.zikamansle.fr/** ; son fonctionnement sur Android doit être contrôlé avec l'APK final.
- Le build **debug** ouvre la copie Cloudflare de test par défaut. Le build **release** ouvre `https://app.zikamansle.fr/`.
- Le code Android repose sur Google Android Browser Helper (Trusted Web Activity), dépendance `2.7.4`.
- Cible de compilation : Android API **36**, compatible avec l'obligation Google Play 2026.
- Identifiant de production proposé : `fr.zikamansle.app`. L'APK debug est suffixé `.debug` pour ne pas interférer avec une installation finale.
- Le manifeste Android utilise désormais `@drawable/zika_icon`. Les workflows récupèrent l'image Zika officielle ; la ressource de secours est un « Z » vectoriel. Le petit pictogramme de notification Android reste un « Z » monochrome.
- L'APK test peut montrer une barre navigateur tant que Digital Asset Links ne confirme pas le domaine. C'est normal pour un prototype, **pas pour la publication**.

- Le canal de notification natif `festival-zikamansle-alerts-v3` utilise la sonnerie système valide et la vibration. Un son personnalisé Zika n'est **pas encore livré**.
- Le test de démarrage automatisé par émulateur Android est déclaré, mais **aucun résultat de compilation ni d'exécution concluante n'a été vérifié à cette date**.

## Générer l'APK sur GitHub
1. Ouvrir l'onglet **Actions**, workflow **Build ZikaMansle Android test APK** de la branche `prepare/google-play-android-2026`.
2. Consulter la compilation **et le test de démarrage sur émulateur**. Télécharger l'artefact `zikamansle-android-test-apk` uniquement après succès.
3. Tester sur Android, sans le présenter comme version définitive.

## Construire en local
Pré-requis : JDK 17 (ou version compatible AGP), Android SDK plateforme 36, Gradle 8.13.

```powershell
gradle -p android-native :app:assembleDebug
```

Pour forcer une URL HTTPS différente dans la compilation debug :

```powershell
gradle -p android-native :app:assembleDebug -PzikaLaunchUrl=https://app.zikamansle.fr/
```

Ne pas substituer une URL provisoire sans vérifier qu'elle contient **l'application Work complète** et qu'elle est sous contrôle de l'association.

## Avant un Google Play .aab signé
- Vérifier sur le téléphone la version pointant sur `https://app.zikamansle.fr/` et toutes ses fonctions : programme, actualités, partenaires, administration, notifications.
- Héberger ou conserver l'app à l'adresse officielle contrôlée, avec manifeste et Service Worker cohérents.
- Icône tête de Zika et visuels officiels ; politique de confidentialité publique ; consentement notifications opérationnel.
- Configurer Digital Asset Links `/.well-known/assetlinks.json` sur le **même hôte** que l'application finale, avec la **SHA-256 Play App Signing** et l'identifiant exact.
- Tester un build pointant vers cette origine. Vérifier le fonctionnement sans barre Chrome, les autorisations et la réception push.
- Générer et signer le `.aab` final **hors du dépôt**, sans y enregistrer une clé privée ou un mot de passe.
- Déposer sur une piste de test de Google Play seulement après approbation du compte.

**Ne pas publier en production : aucun démarrage Android validé ni AAB signé vérifié sur cette branche.**
