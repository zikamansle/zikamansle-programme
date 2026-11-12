# ZikaMansle 1.0.15 — R8 minimal, préserver les points d'entrée Android.
# Les composants déclarés dans AndroidManifest sont conservés par le plugin Android.
# Le pont JavaScript WebView doit conserver ses noms publics tels quels.
-keepclassmembers class fr.zikamansle.app.ZikaWebActivity$NativeNotificationBridge {
    @android.webkit.JavascriptInterface <methods>;
}
# Garder les méthodes JavaScript exposées de toute WebView issue des bibliothèques.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# Firebase Messaging : les consumer rules de son SDK sont appliquées automatiquement.
# Ne jamais masquer les noms des méthodes exposées à window.ZikaAndroid.
