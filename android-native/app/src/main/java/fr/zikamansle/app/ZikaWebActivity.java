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
import android.webkit.PermissionRequest;
import android.speech.RecognizerIntent;
import org.json.JSONObject;
import java.util.ArrayList;
import android.graphics.Bitmap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebViewRenderProcess;
import android.webkit.WebViewRenderProcessClient;
import android.provider.MediaStore;
import android.content.ClipData;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileInputStream;
import android.util.Base64;
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
import android.view.WindowInsets;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.widget.FrameLayout;

/**
 * Stable in-app entry point for the existing ZikaMansle web application.
 * The TWA Android Browser Helper launcher is retained in the manifest for
 * future validated builds, but is NOT required for the first screen to load.
 */
public final class ZikaWebActivity extends Activity {
    private static final int FILE_PICKER_REQUEST = 710;
    private static final int NOTIFICATION_REQUEST = 701;
    private static final int DICTATION_REQUEST = 712;
    private String pendingDictation;
    private static final int DOCUMENT_SAVE_REQUEST = 713;
    private File pendingExport;
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
    private Button recoverButton;
    private Uri recoveryUrl;
    private Uri cameraUri;
    private File cameraFile;
    private boolean rendererUnresponsive;
    private boolean recoveryRequested;
    // HTML5 full-screen content (ZikaRun) needs a native WebChromeClient host.
    private FrameLayout fullscreenContainer;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private int previousSystemUiVisibility;

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
        @JavascriptInterface public boolean exportDocument(String name, String mime, String encoded) {
            if (name == null || mime == null || encoded == null || encoded.length() > 28_000_000
                || !name.matches("[A-Za-z0-9_-]{1,90}\\.(pdf|docx)")) return false;
            boolean pdf = "application/pdf".equals(mime) && name.endsWith(".pdf");
            boolean word = "application/vnd.openxmlformats-officedocument.wordprocessingml.document".equals(mime)
                && name.endsWith(".docx");
            if (!pdf && !word) return false;
            runOnUiThread(() -> {
                if (!isReportPage() || !hasWindowFocus() || pendingExport != null) {
                    Toast.makeText(ZikaWebActivity.this,"Export indisponible pour le moment.",Toast.LENGTH_LONG).show();
                    return;
                }
                new AlertDialog.Builder(ZikaWebActivity.this)
                    .setTitle("Document prêt")
                    .setMessage(name)
                    .setPositiveButton("Enregistrer",(dialog, which) ->
                        prepareExport(name,mime,encoded,pdf,true))
                    .setNeutralButton("Partager",(dialog, which) ->
                        prepareExport(name,mime,encoded,pdf,false))
                    .setNegativeButton("Annuler",null).show();
            });
            return true;
        }

        @JavascriptInterface public void recoverApplication() {
            runOnUiThread(() -> {
                if (web != null && web.getUrl() != null && sameOrigin(Uri.parse(web.getUrl())))
                    confirmRecovery();
            });
        }

        /** Open the Android recognition provider's visible UI, only on ZikaTeam. */
        @JavascriptInterface public void dictateReport(String token) {
            if (token == null || !token.matches("[a-zA-Z0-9_-]{8,80}")) return;
            runOnUiThread(() -> {
                if (!isReportPage() || pendingDictation != null) {
                    deliverDictation(token, "", "busy");
                    return;
                }
                pendingDictation = token;
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Dicter le commentaire du compte rendu");
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                try {
                    startActivityForResult(intent, DICTATION_REQUEST);
                } catch (ActivityNotFoundException | SecurityException error) {
                    pendingDictation = null;
                    deliverDictation(token, "", "unavailable");
                }
            });
        }

        @JavascriptInterface public String getNotificationStatus() {
            if (FirebaseApp.getApps(ZikaWebActivity.this).isEmpty()) return "unconfigured";
            if (!ZikaPushRegistration.approved(ZikaWebActivity.this)) return "disabled";
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) return "blocked";
            return ZikaPushRegistration.deliveryReady(ZikaWebActivity.this)?"enabled":"server_pending";
        }

        @JavascriptInterface public void linkZikaTeam() {
            runOnUiThread(() -> {
                if(web==null||isFinishing()||isDestroyed())return;
                Uri current=Uri.parse(web.getUrl());
                if(!sameOrigin(current)||!current.getPath().startsWith("/zikateam"))return;
                String cookies=CookieManager.getInstance().getCookie("https://app.zikamansle.fr/zikateam/api/command");
                ZikaPushRegistration.linkTeam(ZikaWebActivity.this,cookies);
            });
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

        @JavascriptInterface public void testNotifications() {
            runOnUiThread(() -> {
                if(web==null||isFinishing()||isDestroyed()||!sameOrigin(Uri.parse(web.getUrl())))return;
                ZikaPushRegistration.test(ZikaWebActivity.this);
            });
        }

        @JavascriptInterface public void disableNotifications() {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || web == null
                    || !sameOrigin(Uri.parse(web.getUrl()))) return;
                recordNotificationPrompt();
                ZikaPushRegistration.setApproved(ZikaWebActivity.this, false);
                updateNativeNotificationControls();
                Toast.makeText(ZikaWebActivity.this,
                    "Notifications désactivées pour ce téléphone.",
                    Toast.LENGTH_LONG).show();
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

    // The WebView may only request audio capture on the official ZikaTeam page.
    // No microphone is opened by this activity; the site's push-to-talk gesture
    // remains the sole trigger for getUserMedia. Never grant video or unknown resources.
    private void prepareExport(String name, String mime, String encoded, boolean pdf, boolean save) {
        if (!isReportPage() || pendingExport != null) return;
        try {
            File directory = new File(getCacheDir(),"zika-exports");
            if (!directory.exists() && !directory.mkdirs()) throw new IOException("Cache indisponible");
            File[] previous = directory.listFiles();
            if (previous != null) for (File file : previous)
                if (file.lastModified() < System.currentTimeMillis()-86400000L) file.delete();
            byte[] bytes = Base64.decode(encoded,Base64.NO_WRAP);
            if (bytes.length < 5 || bytes.length > 20*1024*1024
                || (pdf ? !(bytes[0]=='%' && bytes[1]=='P' && bytes[2]=='D' && bytes[3]=='F' && bytes[4]=='-')
                        : !(bytes[0]=='P' && bytes[1]=='K' && bytes[2]==3 && bytes[3]==4)))
                throw new IOException("Fichier invalide");
            File file = new File(directory,System.currentTimeMillis()+"-"+name);
            try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
            if (save) {
                pendingExport = file;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE,name);
                startActivityForResult(intent,DOCUMENT_SAVE_REQUEST);
            } else {
                Uri uri = FileProvider.getUriForFile(this,getPackageName()+".zika.photos",file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM,uri);
                send.setClipData(ClipData.newRawUri(name,uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(send,"Partager le document"));
            }
        } catch (IOException | RuntimeException error) {
            pendingExport = null;
            Toast.makeText(this,"Impossible de préparer le document.",Toast.LENGTH_LONG).show();
        }
    }

    private void confirmRecovery() {
        new AlertDialog.Builder(this).setTitle("Relancer ZikaMansle")
            .setMessage("La connexion sera conservée. Les modifications non enregistrées et les échanges en cours peuvent être perdus.")
            .setNegativeButton("Annuler", null)
            .setPositiveButton("Relancer", (dialog, which) -> {
                CookieManager.getInstance().flush();
                if (web != null) {
                    loadError = false;
                    if (rendererUnresponsive && Build.VERSION.SDK_INT >= 29) {
                        WebViewRenderProcess renderer = web.getWebViewRenderProcess();
                        recoveryRequested = renderer != null;
                        if (renderer != null && renderer.terminate()) return;
                        recoveryRequested = false;
                    }
                    web.reload();
                } else {
                    loadError = false;
                    startWebView(recoveryUrl);
                }
            }).show();
    }

    private void showRecovery(String message) {
        if (status != null) { status.setText(message); status.setVisibility(View.VISIBLE); }
        if (recoverButton != null) recoverButton.setVisibility(View.VISIBLE);
    }

    private void clearCamera(boolean delete) {
        if (cameraUri != null) {
            try { revokeUriPermission(cameraUri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); }
            catch (RuntimeException ignored) { }
        }
        if (delete && cameraFile != null) cameraFile.delete();
        cameraUri = null; cameraFile = null;
    }

    private Intent photoIntent() {
        try {
            File directory = new File(getCacheDir(), "zika-photos");
            if (!directory.exists() && !directory.mkdirs()) return null;
            File[] existing = directory.listFiles();
            if (existing != null) for (File file : existing)
                if (file.lastModified() < System.currentTimeMillis() - 86400000L) file.delete();
            cameraFile = File.createTempFile("zika-photo-", ".jpg", directory);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".zika.photos", cameraFile);
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            camera.setClipData(ClipData.newRawUri("Photo ZikaTeam", cameraUri));
            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return camera;
        } catch (IOException | RuntimeException error) {
            clearCamera(true);
            return null;
        }
    }

    private boolean isReportPage() {
        if (web == null || isFinishing() || isDestroyed() || web.getUrl() == null) return false;
        Uri current = Uri.parse(web.getUrl());
        return sameOrigin(current) && ("/zikateam".equals(current.getPath())
            || "/zikateam/".equals(current.getPath()));
    }

    private void deliverDictation(String token, String text, String status) {
        if (!isReportPage()) return;
        String safe = text == null ? "" : text.substring(0, Math.min(8000, text.length()));
        web.evaluateJavascript("if(typeof window.__zikaNativeReportResult==='function')"
            + "window.__zikaNativeReportResult(" + JSONObject.quote(token) + ","
            + JSONObject.quote(safe) + "," + JSONObject.quote(status) + ");", null);
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == NOTIFICATION_REQUEST) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            ZikaPushRegistration.setApproved(this, granted);
            // La liaison JS peut être demandée avant la fin de l'autorisation Android.
            // Après accord, rattacher l'appareil au compte ZikaTeam connecté.
            if (granted && web != null && !isFinishing() && !isDestroyed()) {
                Uri current = Uri.parse(web.getUrl());
                if (sameOrigin(current) && current.getPath() != null
                        && current.getPath().startsWith("/zikateam")) {
                    String cookies = CookieManager.getInstance().getCookie(
                        "https://app.zikamansle.fr/zikateam/api/command");
                    ZikaPushRegistration.linkTeam(this, cookies);
                }
            }
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
        // Android 15/16 impose l'affichage edge-to-edge : protéger la WebView et
        // sa navigation sans utiliser statusBarColor/navigationBarColor obsolètes.
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
        }
        status = new TextView(this);
        status.setText("Ouverture de ZikaMansle…");
        status.setPadding(24, 22, 24, 22);
        root.addView(status);
        recoverButton = new Button(this);
        recoverButton.setText("Relancer l’application");
        recoverButton.setVisibility(View.GONE);
        recoverButton.setOnClickListener(v -> confirmRecovery());
        root.addView(recoverButton);
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
            @Override public void onPermissionRequest(PermissionRequest request) {
                request.deny(); // Android dictation uses its own visible activity.
            }

            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null || isFinishing() || isDestroyed()) {
                    callback.onCustomViewHidden();
                    return;
                }
                fullscreenView = view;
                fullscreenCallback = callback;
                previousSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
                fullscreenContainer = new FrameLayout(ZikaWebActivity.this);
                fullscreenContainer.setBackgroundColor(android.graphics.Color.BLACK);
                fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                addContentView(fullscreenContainer, new android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT));
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            }

            @Override public void onHideCustomView() {
                closeFullscreen();
            }
            @Override public boolean onShowFileChooser(WebView view,
                ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                clearCamera(true);
                if (view.getUrl() == null || !sameOrigin(Uri.parse(view.getUrl()))) {
                    callback.onReceiveValue(null); return true;
                }
                pendingFiles = callback;
                Intent picker = params.createIntent();
                boolean image = false;
                String[] accepted = params.getAcceptTypes();
                if (accepted != null) for (String type : accepted)
                    if (type != null && type.toLowerCase(java.util.Locale.ROOT).contains("image/")) image = true;
                if (image && isReportPage()) {
                    Intent camera = photoIntent();
                    if (camera != null) {
                        if (params.isCaptureEnabled()) picker = camera;
                        else {
                            picker = Intent.createChooser(picker, "Choisir une photo ou un fichier");
                            picker.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                        }
                    }
                }
                try {
                    startActivityForResult(picker, FILE_PICKER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException | SecurityException e) {
                    pendingFiles = null;
                    clearCamera(true);
                    callback.onReceiveValue(null);
                    return true;
                }
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pendingDictation = null;
                loadError = false;
                if (sameOrigin(Uri.parse(url))) recoveryUrl = Uri.parse(url);
                recoverButton.setVisibility(View.GONE);
                super.onPageStarted(view, url, favicon);
            }

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
                    recoverButton.setVisibility(View.GONE);
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
                    showRecovery("Impossible de charger ZikaMansle. Vérifie ta connexion Internet.");
                }
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (web != view) return false;
                pendingDictation = null;
                pendingFiles = null;
                clearCamera(true);
                fullscreenCallback = null;
                closeFullscreen();
                root.removeView(view);
                web = null;
                view.destroy();
                loadError = true;
                showRecovery("L’affichage de ZikaMansle a été interrompu. Tu peux relancer l’application.");
                rendererUnresponsive = false;
                if (recoveryRequested) {
                    recoveryRequested = false;
                    loadError = false;
                    startWebView(recoveryUrl);
                }
                return true;
            }
        });
        if (Build.VERSION.SDK_INT >= 29) web.setWebViewRenderProcessClient(new WebViewRenderProcessClient() {
            @Override public void onRenderProcessUnresponsive(WebView view, WebViewRenderProcess renderer) {
                if (web == view) {
                    rendererUnresponsive = true;
                    showRecovery("L’application ne répond pas. Tu peux la relancer.");
                }
            }
            @Override public void onRenderProcessResponsive(WebView view, WebViewRenderProcess renderer) {
                if (web == view && !loadError) {
                    rendererUnresponsive = false;
                    status.setVisibility(View.GONE);
                    recoverButton.setVisibility(View.GONE);
                }
            }
        });
        Uri target = sameOrigin(incoming) ? incoming : officialUrl;
        recoveryUrl = target;
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
          + "       enabled==='server_pending'?'Téléphone autorisé, mais envoi Firebase officiel non encore disponible.':"
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
          + "   document.querySelectorAll('iframe[src]').forEach(function(frame){"
          + "     if(!/zikarun/i.test(frame.getAttribute('src')||''))return;"
          + "     frame.setAttribute('allowfullscreen','');"
          + "     frame.setAttribute('webkitallowfullscreen','');"
          + "     var allow=frame.getAttribute('allow')||'';"
          + "     if(!/(?:^|[;\\s])fullscreen(?:[;\\s]|$)/i.test(allow))frame.setAttribute('allow',(allow?allow+'; ':'')+'fullscreen');"
          + "     if(frame.hasAttribute('data-zikarun-fullscreen-added'))return;"
          + "     frame.setAttribute('data-zikarun-fullscreen-added','true');"
          + "     var button=document.createElement('button');"
          + "     button.type='button';button.textContent='⛶ Jouer en plein écran';"
          + "     button.setAttribute('aria-label','Afficher ZikaRun en plein écran');"
          + "     button.style.cssText='display:block;margin:10px auto;padding:12px 18px;background:#ff912e;color:#071b2d;border:0;border-radius:12px;font-size:16px;font-weight:700;';"
          + "     frame.parentNode.insertBefore(button,frame);"
          + "     button.addEventListener('click',function(){"
          + "       if(frame.requestFullscreen){frame.requestFullscreen().catch(function(){"
          + "         window.open(frame.src,'_blank');"
          + "       });}else{window.open(frame.src,'_blank');}"
          + "     });"
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
          + "   var test=document.createElement('button');"
          + "   test.type='button';test.textContent='Tester les notifications';test.setAttribute('data-zika-notifications-test','');"
          + "   test.style.cssText='background:#f59e0b;color:#071b2d;border:0;border-radius:12px;padding:14px 18px;font-weight:700;font-size:16px;';"
          + "   var off=document.createElement('button');"
          + "   off.type='button';off.textContent='Désactiver les notifications';off.setAttribute('data-zika-notifications-disable','');"
          + "   off.style.cssText='background:#10263a;color:white;border:0;border-radius:12px;padding:14px 18px;font-weight:700;font-size:16px;';"
          + "   var status=document.createElement('p');"
          + "   status.setAttribute('data-zika-notification-status','');"
          + "   status.setAttribute('role','status');status.setAttribute('aria-live','polite');"
          + "   status.style.cssText='width:100%;margin:4px 0 0;color:#526270;font-size:14px;';"
          + "   box.append(on,off,test,status);"
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
          + "   if(button.hasAttribute('data-zika-notifications-test')){"
          + "     e.preventDefault();e.stopImmediatePropagation();"
          + "     window.ZikaAndroid.testNotifications();return;"
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

    private void closeFullscreen() {
        if (fullscreenView == null) return;
        if (fullscreenContainer != null) {
            fullscreenContainer.removeView(fullscreenView);
            android.view.ViewParent parent = fullscreenContainer.getParent();
            if (parent instanceof android.view.ViewGroup)
                ((android.view.ViewGroup) parent).removeView(fullscreenContainer);
        }
        fullscreenView = null;
        fullscreenContainer = null;
        getWindow().getDecorView().setSystemUiVisibility(previousSystemUiVisibility);
        if (fullscreenCallback != null) {
            WebChromeClient.CustomViewCallback callback = fullscreenCallback;
            fullscreenCallback = null;
            callback.onCustomViewHidden();
        }
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
        if (code == DOCUMENT_SAVE_REQUEST) {
            File file = pendingExport;
            pendingExport = null;
            if (file != null) {
                try {
                    if (result == RESULT_OK && data != null && data.getData() != null) {
                        try (InputStream in = new FileInputStream(file); OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                            if (out == null) throw new IOException("Destination indisponible");
                            byte[] buffer = new byte[65536]; int count;
                            while ((count=in.read(buffer))!=-1) out.write(buffer,0,count);
                        }
                        Toast.makeText(this,"Document enregistré.",Toast.LENGTH_SHORT).show();
                    }
                } catch (IOException | RuntimeException error) {
                    Toast.makeText(this,"Enregistrement impossible.",Toast.LENGTH_LONG).show();
                } finally { file.delete(); }
            }
            return;
        }
        if (code == DICTATION_REQUEST) {
            String token = pendingDictation;
            pendingDictation = null;
            if (token != null) {
                ArrayList<String> words = result == RESULT_OK && data != null
                    ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
                String spoken = words != null && !words.isEmpty() && words.get(0) != null ? words.get(0).trim() : "";
                deliverDictation(token, spoken, result != RESULT_OK ? "cancelled" : spoken.isEmpty() ? "empty" : "ok");
            }
            return;
        }
        if (code == FILE_PICKER_REQUEST && pendingFiles != null) {
            Uri[] selected = result == RESULT_OK ? WebChromeClient.FileChooserParams.parseResult(result, data) : null;
            boolean captured = result == RESULT_OK && (selected == null || selected.length == 0)
                && cameraUri != null && cameraFile != null && cameraFile.length() > 0;
            if (captured) selected = new Uri[]{cameraUri};
            if (selected != null) {
                for (Uri item : selected) {
                    if (item == null || !"content".equals(item.getScheme())
                        || ((getPackageName() + ".zika.photos").equals(item.getAuthority()) && !item.equals(cameraUri))) {
                        selected = null; break;
                    }
                }
            }
            if (web == null || web.getUrl() == null || !sameOrigin(Uri.parse(web.getUrl()))) selected = null;
            pendingFiles.onReceiveValue(selected);
            pendingFiles = null;
            boolean retainPhoto = selected != null && cameraUri != null && java.util.Arrays.asList(selected).contains(cameraUri);
            clearCamera(!retainPhoto);
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri incoming = intent == null ? null : intent.getData();
        if (!sameOrigin(incoming)) return;
        CookieManager.getInstance().flush();
        if (web != null) web.loadUrl(incoming.toString());
        else { loadError = false; startWebView(incoming); }
    }

    @Override public void onBackPressed() {
        if (fullscreenView != null) {
            closeFullscreen();
            return;
        }
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // Persist the authenticated ZikaTeam cookie when the app goes to the background.
    // Never clear cookies on startup: members must remain signed in across launches.
    @Override protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onDestroy() {
        clearCamera(true);
        if (pendingExport != null) { pendingExport.delete(); pendingExport=null; }
        pendingDictation = null;
        closeFullscreen();
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
