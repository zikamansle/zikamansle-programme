package fr.zikamansle.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.RingtoneManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * The new channel ID is intentionally distinct from the earlier default channel.
 * Android 8+ does not let an app change a channel's sound after creation.
 * Do not rename this ID in future updates unless a new sound is intentionally chosen.
 */
final class ZikaNotificationChannels {
    static final String CHANNEL_ID = "festival-zikamansle-alerts-v3";
    private ZikaNotificationChannels() { }

    static Uri customSound(Context context) {
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }

    static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "ZikaMansle · alertes et réunions",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Réunions, informations et annonces du festival. Sonnerie Android réglable.");
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(customSound(context), attributes);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
