package fr.zikamansle.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Native FCM token lifecycle for the independent test deployment.
 * The token is never logged. No network registration happens without opt-in.
 */
final class ZikaPushRegistration {
    private static final String PREFS = "zika_push";
    private static final String APPROVED = "approved";
    private ZikaPushRegistration() {}

    static boolean approved(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(APPROVED, false);
    }
    static void setApproved(Context context, boolean approved) {
        SharedPreferences prefs=context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(APPROVED, approved).apply();
        // Native push must never block the app opening after the Android permission
        // dialog (including on phones with an unavailable Play Services instance).
        try {
            if (FirebaseApp.getApps(context).isEmpty()) return;
            FirebaseMessaging messaging=FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(approved);
            if (approved) refresh(context);
            else messaging.deleteToken();
        } catch (RuntimeException unavailable) {
            Log.w("ZikaMansle", "Native push unavailable; continue normal app launch");
        }
    }
    private static boolean permissionGranted(Context context) {
        return Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }
    static void refresh(Context context) {
        if (!approved(context) || !permissionGranted(context) ||
            FirebaseApp.getApps(context).isEmpty()) return;
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                if (token != null && !token.isEmpty()) register(context,token);
            }).addOnFailureListener(error ->
                Log.w("ZikaMansle", "Native push token unavailable (no token logged)"));
        } catch (RuntimeException unavailable) {
            Log.w("ZikaMansle", "Native push token setup unavailable; app stays usable");
        }
    }
    static void register(Context context, String token) {
        if (!approved(context) || !permissionGranted(context) || token == null || token.isEmpty()) return;
        String url=context.getString(R.string.zika_native_registration_url);
        Uri uri=Uri.parse(url);
        // Registration is staging-only until the production server is explicitly approved.
        if (!"https".equals(uri.getScheme()) ||
            !"zikamansle-app-staging.zikamansle.workers.dev".equals(uri.getHost()) ||
            !"/api/native/subscribe".equals(uri.getPath())) return;
        new Thread(() -> {
            HttpURLConnection connection=null;
            try {
                connection=(HttpURLConnection)new URL(url).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Content-Type","application/json");
                JSONObject payload=new JSONObject();
                payload.put("token",token);
                payload.put("platform","android");
                byte[] bytes=payload.toString().getBytes(StandardCharsets.UTF_8);
                try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
                int code=connection.getResponseCode();
                if(code<200||code>=300)
                    Log.w("ZikaMansle","Native push registration rejected ("+code+")");
            } catch(Exception e) {
                Log.w("ZikaMansle","Native push registration unavailable");
            } finally {
                if(connection!=null)connection.disconnect();
            }
        },"zika-push-registration").start();
    }
}
