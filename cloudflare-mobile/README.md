# ZikaMansle — accès Administration et notifications Android

## 1. Accès dans « Plus »

Le site mobile actuellement publié sur **https://app.zikamansle.fr/** est servi via Cloudflare, séparément du site Wix et du programme interactif Supabase.

- La page https://app.zikamansle.fr/admin-notifications existe et contrôle déjà les droits d'envoi via `/api/push/admin`.
- Le fichier mobile public `mobile.js` construit le menu `Plus` dans `morePage()`.
- Le script `patch-admin-link.mjs` insère uniquement une entrée vers `/admin-notifications`. L'entrée ne confère aucun droit et la page conserve l'authentification serveur existante.

**Déploiement** : appliquer le patch sur le **fichier mobile.js de la version Cloudflare en place**, puis déployer via le projet Cloudflare propriétaire de `app.zikamansle.fr`. Ne pas remplacer le déploiement par le dépôt `zikamansle-programme` (il n'est pas la source complète de cette application). Ne pas modifier le site Wix.

L'accès Cloudflare n'est pas disponible dans les connecteurs actuellement installés ; ce code n'est donc **pas encore publié sur l'application en ligne**.

## 2. Notifications Android attribuées à ZikaMansle

Le manifeste Android de la branche `prepare/google-play-android-2026` comprend :
- `android.permission.POST_NOTIFICATIONS`
- un `DelegationService` fourni par Android Browser Helper
- une icône de notification monochrome `Z`
- un filtre HTTPS `android:autoVerify` pour `app.zikamansle.fr`

Le nouveau projet **ne doit pas être publié avant** :
1. Dans Google Play Console : copier la **SHA-256 du certificat de signature de l'application** (et non supposer que c'est celui de la clé d'import/upload).
2. Sur le serveur de `app.zikamansle.fr`, publier `/.well-known/assetlinks.json` en HTTPS, type application/json, avec `package_name: fr.zikamansle.app` et la SHA-256 du certificat de signature Play.
3. Vérifier l'association via Digital Asset Links et une installation depuis Google Play (pas un APK debug différent).
4. Vérifier la permission de notification Android 13+ et une réception de push **application fermée/écran éteint**, affichée comme `ZikaMansle` dans les paramètres de notifications Android.
5. Confirmer le lancement, programme, favoris, navigation, icône et liens avant toute mise à jour Play.

La version actuellement fonctionnelle sur le Redmi doit rester inchangée jusqu'à ces vérifications.

### Modèle d'assetlinks.json

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "fr.zikamansle.app",
      "sha256_cert_fingerprints": ["REMPLACER_PAR_LA_SHA256_DU_CERTIFICAT_PLAY"]
    }
  }
]
```

Le modèle contient volontairement un placeholder, car la SHA-256 Play n'est pas accessible via les connecteurs présents. Il ne doit pas être publié tel quel.
