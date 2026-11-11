package fr.zikamansle.app;

import android.app.Application;
import android.util.Log;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

/** Initializes native Android push only when a real Firebase project is configured. */
public final class ZikaApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            android.app.NotificationManager manager =
                (android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new android.app.NotificationChannel(
                "festival-zikamansle","Actualités du Festival ZikaMansle",
                android.app.NotificationManager.IMPORTANCE_DEFAULT));
        }
        String id = getString(R.string.zika_firebase_app_id);
        String api = getString(R.string.zika_firebase_api_key);
        String sender = getString(R.string.zika_firebase_sender_id);
        String project = getString(R.string.zika_firebase_project_id);
        if (id.isEmpty() || api.isEmpty() || sender.isEmpty() || project.isEmpty()) {
            Log.i("ZikaMansle", "Native push not configured; normal app launch.");
            return;
        }
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId(id).setApiKey(api)
                    .setGcmSenderId(sender).setProjectId(project).build();
                FirebaseApp.initializeApp(this, options);
            }
        } catch (RuntimeException e) {
            // Never crash the festival app if Firebase configuration is incorrect.
            Log.e("ZikaMansle", "Native push initialization failed (" + e.getClass().getSimpleName() + ")");
        }
    }
}
