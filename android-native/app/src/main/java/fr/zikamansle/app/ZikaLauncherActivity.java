package fr.zikamansle.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.util.Log;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.net.Uri;

/** One-time, optional Android notification consent before launching the existing TWA. */
public final class ZikaLauncherActivity extends Activity {
    private static final int REQUEST_NOTIFICATIONS=701;
    private static final String ASKED="notification_permission_asked";
    private boolean handedOff=false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Keep the existing festival app available if Firebase has not yet been provisioned.
        if(com.google.firebase.FirebaseApp.getApps(this).isEmpty()) {
            launchFestival();
            return;
        }
        if(!getPreferences(MODE_PRIVATE).getBoolean(ASKED,false)) {
            new AlertDialog.Builder(this)
                .setTitle("Notifications ZikaMansle")
                .setMessage("Souhaitez-vous recevoir les annonces et les informations pratiques du festival sur votre téléphone ? Vous pourrez modifier ce choix dans les paramètres Android.")
                .setPositiveButton("Activer",(dialog,which)->requestNotifications())
                .setNegativeButton("Plus tard",(dialog,which)->{
                    getPreferences(MODE_PRIVATE).edit().putBoolean(ASKED,true).apply();
                    ZikaPushRegistration.setApproved(this,false);
                    launchFestival();
                })
                .setCancelable(false).show();
        } else {
            ZikaPushRegistration.refresh(this);
            launchFestival();
        }
    }
    private void requestNotifications() {
        getPreferences(MODE_PRIVATE).edit().putBoolean(ASKED,true).apply();
        if(Build.VERSION.SDK_INT>=33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},REQUEST_NOTIFICATIONS);
        } else {
            ZikaPushRegistration.setApproved(this,true);
            launchFestival();
        }
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(code,permissions,results);
        if(code==REQUEST_NOTIFICATIONS) {
            ZikaPushRegistration.setApproved(this,results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED);
            launchFestival();
        }
    }
    private void launchFestival() {
        if(handedOff)return;
        handedOff=true;
        Intent intent=new Intent(this,ZikaWebActivity.class);
        Uri data=getIntent().getData();
        if(data!=null) {
            Uri origin=Uri.parse(getString(R.string.zika_launch_url));
            if("https".equals(data.getScheme()) && origin.getHost()!=null
                && origin.getHost().equals(data.getHost())
                && data.getPort()==origin.getPort()) {
                intent.setAction(Intent.ACTION_VIEW);
                // Preserve in-app deep links and avoid redundant installation prompts.
                intent.setData(data.buildUpon().appendQueryParameter("zika_native","1").build());
            }
        }
        // Never leave the app on a blank screen if the native app view
        // cannot resolve its launcher. Preserve access to the official website.
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException error) {
            Log.e("ZikaMansle", "Android web view unavailable; opening HTTPS fallback");
            Uri fallback = Uri.parse(getString(R.string.zika_launch_url));
            Intent browser = new Intent(Intent.ACTION_VIEW, fallback);
            browser.addCategory(Intent.CATEGORY_BROWSABLE);
            try {
                startActivity(browser);
            } catch (ActivityNotFoundException | SecurityException unavailable) {
                handedOff = false;
                new AlertDialog.Builder(this)
                    .setTitle("ZikaMansle")
                    .setMessage("Impossible d’ouvrir l’application. Vérifiez qu’un navigateur Internet est installé.")
                    .setPositiveButton("Fermer", (dialog, which) -> finish())
                    .show();
                return;
            }
        }
        finish();
    }
}
