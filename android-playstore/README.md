# ZikaMansle — préparation Google Play (Android)

Date : 10 novembre 2026. **Branche de préparation seulement ; rien n'est publié sur Google Play.**

## Source
- GitHub : `zikamansle/zikamansle-programme` (PWA existante : `index.html`, `app.js`, `manifest.webmanifest`, `sw.js`).
- Site officiel : https://www.zikamansle.fr/
- Origine souhaitée pour l'application : https://app.zikamansle.fr/ — **à vérifier dans un navigateur avant de générer Android**. La disponibilité de cette origine n'a pas été démontrée par les contrôles actuels. Les URL en `chatgpt.site` ne doivent pas apparaître dans l'application publique si le domaine officiel est retenu.
- Compte éditeur : Association ZikaMansle (validation d'identité Google en cours).

## Paramètres proposés
- Nom : ZikaMansle ; langue : français ; téléchargement : gratuit.
- Application ID : `fr.zikamansle.app` (à confirmer une seule fois avant création dans Play Console).
- Version initiale : `1.0.0`, versionCode `1`.
- API cible Android : **36 au minimum** pour une nouvelle application envoyée après le 31 août 2026.
- Format : **AAB signé**, généré avec Bubblewrap/Trusted Web Activity (TWA) si la PWA en ligne satisfait les exigences.
- Icône principale : **tête officielle de Zika**, pas le « Z » actuellement visible dans `icons/icon-512.png` sur ce dépôt. Le « Z » peut rester pour les notifications, sous réserve de contrôle Android.

## Procédure de production (Windows)
1. Vérifier l'origine et le manifeste PWA : `powershell -ExecutionPolicy Bypass -File android-playstore/check-release.ps1`.
2. Corriger toute anomalie : domaine, accès HTTPS, manifeste, icône Zika, service worker, notifications, liens vers le site, contenu final, confidentialité.
3. Installer Node.js, Java et Android SDK au besoin, puis `npm install -g @bubblewrap/cli` ; lancer `bubblewrap doctor`.
4. Générer le projet Android **à partir du manifeste réellement servi par l'origine finale** : `bubblewrap init --manifest https://app.zikamansle.fr/manifest.webmanifest` (adapter le nom du manifeste s'il diffère). Valider l'identifiant `fr.zikamansle.app` et l'icône officielle.
5. Vérifier dans le projet généré `targetSdkVersion`/ `targetSdk` >= 36, le package, l'icône, l'URL et les versions. Corriger si nécessaire.
6. Configurer la clé d'upload Android dans un stockage privé. **Ne jamais pousser de fichier .jks/.keystore ni de mots de passe dans GitHub.**
7. `bubblewrap build` : produit typiquement un APK de test et un App Bundle signé. Ne pas prétendre qu'un AAB existe avant compilation effective.
8. Après configuration Play App Signing, récupérer les empreintes **SHA-256 du certificat de signature d'application Google Play** (et du certificat local pour les essais si nécessaire). Préparer `/.well-known/assetlinks.json` pour le domaine final, avec les bons noms de package et empreintes ; le rendre disponible par HTTPS.
9. Tester une installation Android réelle : lancement sans barre d'adresse, domaine vérifié, retour, plan, favoris, cache hors ligne, notifications avec permission, billetterie, partages, changement d'orientation, petites tailles d'écran. Voir `tests-et-publication.md`.
10. Valider la fiche Play Store, URL de confidentialité, sécurité des données, captures réelles et illustration promotionnelle ; soumettre en test interne avant toute mise en production.

## Points encore bloquants
- Localiser/confirmer la **version exacte** actuellement utilisée sur les téléphones (le dépôt programme est accessible, mais peut ne pas être la dernière version de la PWA mobile publiée par Work).
- Vérifier que le domaine `app.zikamansle.fr` distribue bien **cette version** de l'application.
- Fournir l'icône tête de Zika validée et les captures réelles.
- Auditer les données collectées par le site, Supabase/Wix et le fournisseur de notifications ; créer la politique de confidentialité publique et saisir les déclarations Google Play exactes.
- Compiler, signer, distribuer aux testeurs et vérifier avant soumission.

**Cette branche ne modifie ni le site ni la branche `main`.**

Sources techniques : https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli ; https://support.google.com/googleplay/android-developer/answer/11926878
