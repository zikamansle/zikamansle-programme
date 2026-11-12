package fr.zikamansle.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Displays native Android notifications using the official Zika badge. */
public final class ZikaMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        super.onNewToken(token);
        ZikaPushRegistration.register(this,token);
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        if(!ZikaPushRegistration.approved(this))return;
        if(Build.VERSION.SDK_INT>=33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        Map<String,String> data=message.getData();
        String title=data.get("title"),body=data.get("body");
        if((title==null||title.isEmpty())&&message.getNotification()!=null)
            title=message.getNotification().getTitle();
        if((body==null||body.isEmpty())&&message.getNotification()!=null)
            body=message.getNotification().getBody();
        if(title==null||title.isEmpty())title="ZikaMansle";
        if(body==null||body.isEmpty())return;
        if(title.length()>80)title=title.substring(0,80);
        if(body.length()>300)body=body.substring(0,300);
        Intent launch=new Intent(this,ZikaLauncherActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Uri target=Uri.parse(data.containsKey("url")?data.get("url"):"");
        Uri base=Uri.parse(getString(R.string.zika_launch_url));
        if("https".equals(target.getScheme())&&base.getHost()!=null&&base.getHost().equals(target.getHost())
            &&target.getPort()==base.getPort())launch.setData(target);
        int notificationId=(int)(System.currentTimeMillis()&0x7fffffff);
        PendingIntent click=PendingIntent.getActivity(this,notificationId,launch,
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        ZikaNotificationChannels.ensure(this);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26
            ?new Notification.Builder(this,ZikaNotificationChannels.CHANNEL_ID)
            :new Notification.Builder(this).setSound(ZikaNotificationChannels.customSound(this));
        builder.setSmallIcon(R.drawable.zika_notification_small).setContentTitle(title)
            .setContentText(body).setAutoCancel(true).setContentIntent(click)
            .setCategory(Notification.CATEGORY_EVENT)
            .setStyle(new Notification.BigTextStyle().bigText(body));
        // The full official Zika head is the large image; the white Z stays the small status-bar icon.
        Bitmap largeIcon=BitmapFactory.decodeResource(getResources(),R.drawable.zika_icon);
        if(largeIcon!=null)builder.setLargeIcon(largeIcon);
        manager.notify(notificationId,builder.build());
    }
}
