# ZikaMansle — Android TWA (projet de compilation de TEST)

Le dossier contient un **vrai projet Android Gradle** pour fabriquer un APK de test. Il ne modifie **pas** le site Wix ni l'app Work déjà publiée.

## État réel au 10/11/2026
- La page Wix officielle vérifiée est https://www.zikamansle.fr/ .
- L'application mobile de Work est distincte et son URL de production et son code complet **n'ont pas été vérifiés**.
- Pour vérifier la chaîne de compilation, l'APK de **test** lance par défaut la page Wix officielle, **pas encore** l'application Work complète.
- Le code Android repose sur Google Android Browser Helper (Trusted Web Activity), dépendance `2.7.4`.
- Cible de compilation : Android API **36**, compatible avec l'obligation Google Play 2026.
- Identifiant de production proposé : `fr.zikamansle.app`. L'APK debug est suffixé `.debug` pour ne pas interférer avec une installation finale.
- L'icône Android du **prototype** est un pictogramme Android générique ; le fichier final doit utiliser **la tête officielle de Zika**, sans réinterprétation. Le « Z » peut servir aux notifications.
- L'APK test peut montrer une barre navigateur tant que Digital Asset Links ne confirme pas le domaine. C'est normal pour un prototype, **pas pour la publication**.

## Générer l'APK sur GitHub
1. Ouvrir l'onglet **Actions**, workflow **Build ZikaMansle Android test APK** de la branche `prepare/google-play-android-2026`.
2. Télécharger l'artefact `zikamansle-android-test-apk` après succès.
3. Tester sur Android, sans le présenter comme version définitive.

## Construire en local
Pré-requis : JDK 17 (ou version compatible AGP), Android SDK plateforme 36, Gradle 8.13.

```powershell
gradle -p android-native :app:assembleDebug
```

Pour pointer vers une URL HTTPS différente (une fois son origine publique validée) :

```powershell
gradle -p android-native :app:assembleDebug -PzikaLaunchUrl=https://app.zikamansle.fr/
```

Ne pas substituer une URL provisoire sans vérifier qu'elle contient **l'application Work complète** et qu'elle est sous contrôle de l'association.

## Avant un Google Play .aab signé
- Identifier l'URL HTTPS définitive de l'app Work et toutes ses fonctions : programme, actualités, partenaires, administration, notifications.
- Héberger ou conserver l'app à l'adresse officielle contrôlée, avec manifeste et Service Worker cohérents.
- Icône tête de Zika et visuels officiels ; politique de confidentialité publique ; consentement notifications opérationnel.
- Configurer Digital Asset Links `/.well-known/assetlinks.json` sur le **même hôte** que l'application finale, avec la **SHA-256 Play App Signing** et l'identifiant exact.
- Tester un build pointant vers cette origine. Vérifier le fonctionnement sans barre Chrome, les autorisations et la réception push.
- Générer et signer le `.aab` final **hors du dépôt**, sans y enregistrer une clé privée ou un mot de passe.
- Déposer sur une piste de test de Google Play seulement après approbation du compte.

**Aucun AAB Play Store prêt à soumettre n'existe à ce stade.**
