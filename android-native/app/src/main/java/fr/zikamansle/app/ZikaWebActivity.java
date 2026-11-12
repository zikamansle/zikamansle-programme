package fr.zikamansle.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.os.Environment;
import android.webkit.URLUtil;
import android.widget.Toast;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.FirebaseApp;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceError;
import android.webkit.ValueCallback;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;

/**
 * Stable in-app entry point for the existing ZikaMansle web application.
 * The TWA Android Browser Helper launcher is retained in the manifest for
 * future validated builds, but is NOT required for the first screen to load.
 */
public final class ZikaWebActivity extends Activity {
    private static final int FILE_PICKER_REQUEST = 710;
    private static final int NOTIFICATION_REQUEST = 701;
    private static final String NOTIFICATION_PREFS = "zika_notification_prompt";
    private static final String ASKED = "notification_permission_asked";
    private WebView web;
    private ValueCallback<Uri[]> pendingFiles;
    private Uri officialUrl;
    private Uri teamUrl;
    // ZikaTeam is a section of the SAME origin as the rest of ZikaMansle.
    private LinearLayout root;
    private TextView status;
    private boolean loadError;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        officialUrl = Uri.parse(getString(R.string.zika_launch_url));
        teamUrl = officialUrl.buildUpon().encodedPath("/zikateam").clearQuery().build();
        if (!"https".equals(officialUrl.getScheme()) || officialUrl.getHost() == null) {
            showProblem("Adresse de l’application incorrecte.");
            return;
        }
        startWebView(getIntent() != null ? getIntent().getData() : null);
        // The app window exists before any notification prompt is shown.
        askNotificationPermissionIfNeeded();
    }

    private void askNotificationPermissionIfNeeded() {
        if (FirebaseApp.getApps(this).isEmpty()) return;
        if (getSharedPreferences(NOTIFICATION_PREFS, MODE_PRIVATE).getBoolean(ASKED, false)) {
            ZikaPushRegistration.refresh(this);
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Notifications ZikaMansle")
            .setMessage("Souhaitez-vous recevoir les annonces et les informations pratiques du festival sur votre téléphone ? Vous pourrez modifier ce choix dans les paramètres Android.")
            .setPositiveButton("Activer", (dialog, which) -> requestNotificationPermission())
            .setNegativeButton("Plus tard", (dialog, which) -> {
                recordNotificationPrompt();
                ZikaPushRegistration.setApproved(this, false);
            })
            .setCancelable(false)
            .show();
    }

    /** Android-only notification controls. No browser PushManager is used. */
    public final class NativeNotificationBridge {
        @JavascriptInterface public String getNotificationStatus() {
            if (FirebaseApp.getApps(ZikaWebActivity.this).isEmpty()) return "unconfigured";
            if (!ZikaPushRegistration.approved(ZikaWebActivity.this)) return "disabled";
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) return "blocked";
            return "enabled";
        }

        @JavascriptInterface public void enableNotifications() {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || !sameOrigin(Uri.parse(web.getUrl()))) return;
                if (FirebaseApp.getApps(ZikaWebActivity.this).isEmpty()) {
                    Toast.makeText(ZikaWebActivity.this,
                        "Notifications non configurées dans cette version.",
                        Toast.LENGTH_LONG).show();
                    updateNativeNotificationControls();
                    return;
                }
                recordNotificationPrompt();
                if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_REQUEST);
                } else {
                    ZikaPushRegistration.setApproved(ZikaWebActivity.this, true);
                    updateNativeNotificationControls();
                    Toast.makeText(ZikaWebActivity.this,
                        "Notifications activées sur ce téléphone. Vérification de l’enregistrement nécessaire.",
                        Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface public void disableNotifications() {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || !sameOrigin(Uri.parse(web.getUrl()))) return;
                new AlertDialog.Builder(ZikaWebActivity.this)
                    .setTitle("Désactiver les notifications ?")
                    .setMessage("Tu ne recevras plus les alertes du festival sur ce téléphone. Tu pourras les réactiver ici.")
                    .setNegativeButton("Annuler", (dialog, which) -> {})
                    .setPositiveButton("Désactiver", (dialog, which) -> {
                        recordNotificationPrompt();
                        ZikaPushRegistration.setApproved(ZikaWebActivity.this, false);
                        updateNativeNotificationControls();
                        Toast.makeText(ZikaWebActivity.this,
                            "Notifications désactivées pour ce téléphone.",
                            Toast.LENGTH_LONG).show();
                    })
                    .show();
            });
        }
    }

    private void updateNativeNotificationControls() {
        if (web != null && !isFinishing() && !isDestroyed())
            web.evaluateJavascript(
                "if(window.__zikaRefreshNativeNotifications)window.__zikaRefreshNativeNotifications();",
                null);
    }

    private void recordNotificationPrompt() {
        getSharedPreferences(NOTIFICATION_PREFS, MODE_PRIVATE).edit()
            .putBoolean(ASKED, true).apply();
    }

    private void requestNotificationPermission() {
        recordNotificationPrompt();
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_REQUEST);
        } else {
            ZikaPushRegistration.setApproved(this, true);
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == NOTIFICATION_REQUEST) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            ZikaPushRegistration.setApproved(this, granted);
            updateNativeNotificationControls();
            Toast.makeText(this, granted
                ? "Notifications Android autorisées. Enregistrement du téléphone demandé."
                : "Notifications désactivées. Tu peux les autoriser dans les réglages Android.",
                Toast.LENGTH_LONG).show();
            // The WebView remains open: no activity transition or finish() here.
        }
    }

    private void startWebView(Uri incoming) {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        status.setText("Ouverture de ZikaMansle…");
        status.setPadding(24, 22, 24, 22);
        root.addView(status);
        web = new WebView(this);
        web.setId(View.generateViewId());
        root.addView(web, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new NativeNotificationBridge(), "ZikaAndroid");
        // Allow ZikaTeam PDF exports and downloadable files to use the same
        // authenticated session as the in-app site.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri download = Uri.parse(url);
            if (!"https".equals(download.getScheme())
                || (!sameOrigin(download) && !isTeamOrigin(download))) {
                Toast.makeText(this, "Téléchargement refusé : lien non sécurisé.", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(download);
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent != null ? userAgent : "");
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
                request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType));
                request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                    URLUtil.guessFileName(url, contentDisposition, mimeType));
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "Téléchargement lancé", Toast.LENGTH_SHORT).show();
            } catch (RuntimeException error) {
                Toast.makeText(this, "Téléchargement indisponible.", Toast.LENGTH_LONG).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,
                ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                Intent picker = params.createIntent();
                try {
                    startActivityForResult(picker, FILE_PICKER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException | SecurityException e) {
                    pendingFiles = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (sameOrigin(target) || isTeamOrigin(target)) return false;
                if ("https".equals(target.getScheme()) || "http".equals(target.getScheme()) ||
                    "mailto".equals(target.getScheme()) || "tel".equals(target.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, target));
                    } catch (ActivityNotFoundException | SecurityException ignored) {
                        status.setText("Aucune application disponible pour ouvrir ce lien.");
                        status.setVisibility(View.VISIBLE);
                    }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!loadError) {
                    status.setVisibility(View.GONE);
                    android.util.Log.i("ZikaMansle", "ZIKA_WEBVIEW_PAGE_FINISHED host=" + Uri.parse(url).getHost());
                    if (sameOrigin(Uri.parse(url))) installZikaTeamMenu(view);
                    if (isTeamOrigin(Uri.parse(url))) {
                        view.evaluateJavascript("Boolean(document.getElementById('teamRoot'))",
                            result -> android.util.Log.i("ZikaMansle",
                                "true".equals(result) ? "ZIKA_TEAM_CONTENT_READY" :
                                    "ZIKA_TEAM_CONTENT_NOT_FOUND"));
                    }

                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request,
                WebResourceError error) {
                if (request.isForMainFrame()) {
                    loadError = true;
                    status.setText("Impossible de charger ZikaMansle. Vérifie ta connexion Internet.");
                    status.setVisibility(View.VISIBLE);
                }
            }
        });
        Uri target = sameOrigin(incoming) ? incoming : officialUrl;
        web.loadUrl(target.toString());
    }

    private boolean isTeamOrigin(Uri url) {
        return url != null && "https".equals(url.getScheme())
            && teamUrl.getHost().equalsIgnoreCase(url.getHost())
            && teamUrl.getPort() == url.getPort();
    }

    /**
     * ZikaTeam is an entry within "Plus", NOT an extra native navigation tab.
     * The original menu items and routing remain untouched.
     */
    /** Hide PWA installation buttons inside Android; ZikaTeam stays a single menu section. */
    /** Android UI: one ZikaTeam entry, no PWA install call, native push on/off. */
    private void installZikaTeamMenu(WebView view) {
        String js = ""
          + "(function(){"
          + " if(window.__zikaNativeUiCleanup)return;"
          + " window.__zikaNativeUiCleanup=true;"
          + " function text(el){return (el.textContent||'').replace(/\\s+/g,' ').trim();}"
          + " function isTeam(a){return a.matches('a[href]')&&(/(?:^|\\/)zikateam(?:\\/|$|[?#])/i.test(a.getAttribute('href')||'')||/^ZikaTeam(?:\\s|$)/i.test(text(a)));}"
          + " function isNews(){"
          + "   return Array.from(document.querySelectorAll('h1,h2,h3')).some(function(h){"
          + "     return /actualit.s\\s*(?:&|et)\\s*notifications/i.test(text(h));"
          + "   });"
          + " }"
          + " function nativeState(){"
          + "   try{return window.ZikaAndroid.getNotificationStatus();}"
          + "   catch(e){return 'unconfigured';}"
          + " }"
          + " function refresh(){"
          + "   var box=document.getElementById('zika-native-notification-controls');"
          + "   if(!box)return;"
          + "   var status=box.querySelector('[data-zika-notification-status]');"
          + "   var enabled=nativeState();"
          + "   if(status){"
          + "     status.textContent=enabled==='enabled'?'Notifications activées sur ce téléphone. La réception d’une alerte reste à vérifier.':"
          + "       enabled==='blocked'?'Notifications bloquées par Android. Autorise-les dans les paramètres du téléphone.':"
          + "       enabled==='unconfigured'?'Notifications non configurées dans cette version.':"
          + "       'Notifications désactivées sur ce téléphone.';"
          + "   }"
          + "   var on=box.querySelector('[data-zika-notifications-enable]');"
          + "   var off=box.querySelector('[data-zika-notifications-disable]');"
          + "   if(on)on.disabled=enabled==='enabled'||enabled==='unconfigured';"
          + "   if(off)off.disabled=enabled==='disabled'||enabled==='unconfigured';"
          + " }"
          + " window.__zikaRefreshNativeNotifications=refresh;"
          + " function run(){"
          + "   var anchors=Array.from(document.querySelectorAll('a[href]'));"
          + "   var teamLinks=anchors.filter(isTeam);"
          + "   var official=teamLinks.find(function(a){return !a.hasAttribute('data-zikateam-native-menu');});"
          + "   if(official){teamLinks.forEach(function(a){if(a!==official&&a.hasAttribute('data-zikateam-native-menu'))a.remove();});}"
          + "   else if(!teamLinks.length){"
          + "     var source=anchors.find(function(a){return /Devenir partenaire/i.test(text(a));});"
          + "     if(source){"
          + "       var item=source.cloneNode(true);"
          + "       item.removeAttribute('id');item.removeAttribute('onclick');item.removeAttribute('target');"
          + "       item.setAttribute('data-zikateam-native-menu','true');"
          + "       item.href=location.origin+'/zikateam';"
          + "       item.replaceChildren(document.createTextNode('ZikaTeam — Bénévoles, responsables et secrétariat'));"
          + "       source.insertAdjacentElement('afterend',item);"
          + "     }"
          + "   }"
          + "   document.querySelectorAll('a,button,[role=button]').forEach(function(el){"
          + "     var label=text(el);"
          + "     if(/^(?:installer(?:\\s+(?:l['’]application|l['’]appli|zika(?:mansle)?|sur (?:le )?téléphone))?|installer maintenant|ajouter (?:à|sur) l['’]écran d['’]accueil)(?:\\s*[›→↗])?$/i.test(label)){"
          + "       if(el.style.display!=='none')el.style.setProperty('display','none','important');"
          + "       if(el.getAttribute('aria-hidden')!=='true')el.setAttribute('aria-hidden','true');"
          + "     }"
          + "   });"
          + "   if(!isNews())return;"
          + "   var heading=Array.from(document.querySelectorAll('h2,h3')).find(function(h){return /gardons le contact/i.test(text(h));});"
          + "   if(!heading)return;"
          + "   var card=heading.closest('section,article,.card')||heading.parentElement.parentElement;"
          + "   if(!card)return;"
          + "   var buttons=Array.from(card.querySelectorAll('button,a,[role=button]')).filter(function(el){"
          + "     return !el.closest(\'#zika-native-notification-controls\') && /^(?:activer|autoriser|recevoir).{0,35}notifications?/i.test(text(el));"
          + "   });"
          + "   buttons.forEach(function(b){if(b.style.display!=='none')b.style.setProperty('display','none','important');});"
          + "   Array.from(card.querySelectorAll('p,div')).filter(function(p){"
          + "     return p.children.length===0&&/(?:notifications non prises en charge sur ce navigateur|sur iphone\\s*:)/i.test(text(p));"
          + "   }).forEach(function(p){if(p.style.display!=='none')p.style.setProperty('display','none','important');});"
          + "   if(card.querySelector('#zika-native-notification-controls'))return;"
          + "   var box=document.createElement('div');"
          + "   box.id='zika-native-notification-controls';"
          + "   box.style.cssText='margin:18px 0;display:flex;gap:12px;flex-wrap:wrap;';"
          + "   var on=document.createElement('button');"
          + "   on.type='button';on.textContent='Activer les notifications';on.setAttribute('data-zika-notifications-enable','');"
          + "   on.style.cssText='background:#ff912e;color:#071b2d;border:0;border-radius:12px;padding:14px 18px;font-weight:700;font-size:16px;';"
          + "   var off=document.createElement('button');"
          + "   off.type='button';off.textContent='Désactiver les notifications';off.setAttribute('data-zika-notifications-disable','');"
          + "   off.style.cssText='background:#10263a;color:white;border:0;border-radius:12px;padding:14px 18px;font-weight:700;font-size:16px;';"
          + "   var status=document.createElement('p');"
          + "   status.setAttribute('data-zika-notification-status','');"
          + "   status.setAttribute('role','status');status.setAttribute('aria-live','polite');"
          + "   status.style.cssText='width:100%;margin:4px 0 0;color:#526270;font-size:14px;';"
          + "   box.append(on,off,status);"
          + "   if(buttons[0])buttons[0].insertAdjacentElement('afterend',box);"
          + "   else card.appendChild(box);"
          + "   refresh();"
          + " }"
          + " document.addEventListener('click',function(e){"
          + "   var button=e.target&&e.target.closest?e.target.closest('button,a,[role=button]'):null;"
          + "   if(!button||!window.ZikaAndroid)return;"
          + "   if(button.hasAttribute('data-zika-notifications-enable')){"
          + "     e.preventDefault();e.stopImmediatePropagation();"
          + "     window.ZikaAndroid.enableNotifications();return;"
          + "   }"
          + "   if(button.hasAttribute('data-zika-notifications-disable')){"
          + "     e.preventDefault();e.stopImmediatePropagation();"
          + "     window.ZikaAndroid.disableNotifications();return;"
          + "   }"
          + "   if(button.hasAttribute('data-link-push')||"
          + "      /^(?:activer|autoriser|recevoir).{0,45}notifications?/i.test(text(button))){"
          + "     e.preventDefault();e.stopImmediatePropagation();"
          + "     window.ZikaAndroid.enableNotifications();"
          + "   }"
          + " },true);"
          + " run();"
          + " new MutationObserver(run).observe(document.documentElement,{subtree:true,childList:true});"
          + "})();";
        view.evaluateJavascript(js, result ->
            android.util.Log.i("ZikaMansle", "ZIKA_NATIVE_UI_CLEANUP_READY"));
    }

    private boolean sameOrigin(Uri url) {
        return url != null && "https".equals(url.getScheme())
            && officialUrl.getHost().equalsIgnoreCase(url.getHost())
            && officialUrl.getPort() == url.getPort();
    }

    private void showProblem(String message) {
        new AlertDialog.Builder(this).setTitle("ZikaMansle")
            .setMessage(message)
            .setPositiveButton("Fermer", (dialog, which) -> finish())
            .setCancelable(false).show();
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_PICKER_REQUEST && pendingFiles != null) {
            pendingFiles.onReceiveValue(
                result == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(result, data) : null
            );
            pendingFiles = null;
        }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (pendingFiles != null) {
            pendingFiles.onReceiveValue(null);
            pendingFiles = null;
        }
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
