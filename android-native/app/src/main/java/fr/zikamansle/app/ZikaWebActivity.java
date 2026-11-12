package fr.zikamansle.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.firebase.FirebaseApp;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
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
    private LinearLayout root;
    private TextView status;
    private boolean loadError;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        officialUrl = Uri.parse(getString(R.string.zika_launch_url));
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
            ZikaPushRegistration.setApproved(this,
                results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED);
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
                if (sameOrigin(target)) return false;
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
