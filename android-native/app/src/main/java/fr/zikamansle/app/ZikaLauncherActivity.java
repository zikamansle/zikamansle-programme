package fr.zikamansle.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * Stable entry point: open the app first. The notification permission prompt
 * belongs to ZikaWebActivity, so answering it can never interrupt navigation.
 */
public final class ZikaLauncherActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Intent intent = new Intent(this, ZikaWebActivity.class);
        Uri incoming = getIntent() != null ? getIntent().getData() : null;
        Uri origin = Uri.parse(getString(R.string.zika_launch_url));
        if (incoming != null && "https".equals(incoming.getScheme())
            && origin.getHost() != null && origin.getHost().equalsIgnoreCase(incoming.getHost())
            && origin.getPort() == incoming.getPort()) {
            intent.setData(incoming.buildUpon().appendQueryParameter("zika_native", "1").build());
        }
        try {
            startActivity(intent);
            finish();
        } catch (ActivityNotFoundException | SecurityException error) {
            Log.e("ZikaMansle", "Integrated app unavailable; opening HTTPS fallback");
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, origin));
                finish();
            } catch (ActivityNotFoundException | SecurityException unavailable) {
                new AlertDialog.Builder(this)
                    .setTitle("ZikaMansle")
                    .setMessage("Impossible d’ouvrir l’application. Vérifiez qu’un navigateur Internet est installé.")
                    .setPositiveButton("Fermer", (dialog, which) -> finish())
                    .show();
            }
        }
    }
}
