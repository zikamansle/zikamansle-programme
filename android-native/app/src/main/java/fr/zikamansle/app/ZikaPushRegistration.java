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
 * Firebase natif uniquement : aucune inscription Chrome ou Web Push.
 * N'enregistre et ne relie l'appareil qu'après consentement Android.
 * Le jeton et les cookies de session ne sont jamais exposés au JavaScript.
 */
final class ZikaPushRegistration {
    private static final String PREFS = "zika_push";
    private static final String APPROVED = "approved";
    private static final String DELIVERY_READY = "delivery_ready";
    private ZikaPushRegistration() {}

    static boolean approved(Context context) {
        return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
            .getBoolean(APPROVED,false);
    }
    static boolean deliveryReady(Context context){
        return context.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
            .getBoolean(DELIVERY_READY,false);
    }
    private static boolean permissionGranted(Context context) {
        return Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }
    private static String host(Context context){
        return Uri.parse(context.getString(R.string.zika_launch_url)).getHost();
    }
    private static String registrationUrl(Context context){
        String url=context.getString(R.string.zika_native_registration_url);
        Uri uri=Uri.parse(url);
        String site=host(context);
        if(site==null||(!"app.zikamansle.fr".equals(site)&&
            !"zikamansle-app-staging.zikamansle.workers.dev".equals(site)))return null;
        if(!"https".equals(uri.getScheme())||!site.equals(uri.getHost())||
            !"/api/native/subscribe".equals(uri.getPath())||
            uri.getPort()!=-1||uri.getUserInfo()!=null||uri.getQuery()!=null)return null;
        return url;
    }
    static void setApproved(Context context, boolean value) {
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        prefs.edit().putBoolean(APPROVED,value).apply();
        try {
            if(FirebaseApp.getApps(context).isEmpty())return;
            FirebaseMessaging messaging=FirebaseMessaging.getInstance();
            if(value){
                messaging.setAutoInitEnabled(true);
                refresh(context);
            } else {
                prefs.edit().putBoolean(DELIVERY_READY,false).apply();
                // Revoke the device on the server before deleting the local FCM token.
                messaging.getToken().addOnCompleteListener(task->{
                    if(task.isSuccessful()&&task.getResult()!=null){
                        String token=task.getResult();
                        new Thread(()->removeServerDevice(context,token),"zika-native-unsubscribe").start();
                    }
                    messaging.deleteToken();
                });
                messaging.setAutoInitEnabled(false);
            }
        }catch(RuntimeException unavailable){
            Log.w("ZikaMansle","FCM unavailable; normal launch preserved");
        }
    }
    static void refresh(Context context){
        if(!approved(context)||!permissionGranted(context)||
            FirebaseApp.getApps(context).isEmpty()||registrationUrl(context)==null)return;
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{
                if(token!=null&&!token.isEmpty())register(context,token);
            }).addOnFailureListener(error->
                Log.w("ZikaMansle","FCM token unavailable (token not logged)"));
        }catch(RuntimeException unavailable){
            Log.w("ZikaMansle","FCM token setup unavailable");
        }
    }
    static void register(Context context,String token){
        if(!approved(context)||!permissionGranted(context)||
            token==null||token.isEmpty()||registrationUrl(context)==null)return;
        new Thread(()->registerSync(context,token),"zika-native-register").start();
    }
    private static boolean registerSync(Context context,String token){
        String url=registrationUrl(context);
        if(url==null)return false;
        try {
            JSONObject body=new JSONObject();
            body.put("token",token);
            body.put("platform","android");
            HttpURLConnection connection=post(url,body,null,null);
            try{
                int code=connection.getResponseCode();
                if(code<200||code>=300){
                    Log.w("ZikaMansle","FCM device registration rejected "+code);
                    return false;
                }
                try(java.io.InputStream stream=connection.getInputStream()){
                    byte[] response=stream.readNBytes(2048);
                    JSONObject data=new JSONObject(new String(response,StandardCharsets.UTF_8));
                    context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
                        .putBoolean(DELIVERY_READY,data.optBoolean("deliveryReady",false)).apply();
                }
                return true;
            }finally{connection.disconnect();}
        }catch(Exception e){
            Log.w("ZikaMansle","FCM device registration unavailable");
            return false;
        }
    }
    /** Called only after ZikaTeam has returned a verified, charter-accepted session. */
    static void linkTeam(Context context,String cookies){
        if(!approved(context)||!permissionGranted(context)||
            !"app.zikamansle.fr".equals(host(context))||
            cookies==null||cookies.isEmpty()||
            FirebaseApp.getApps(context).isEmpty())return;
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{
            if(token==null||token.isEmpty())return;
            new Thread(()->{
                if(!registerSync(context,token))return;
                try{
                    JSONObject body=new JSONObject();
                    body.put("op","native.link");
                    body.put("token",token);
                    HttpURLConnection conn=post("https://app.zikamansle.fr/zikateam/api/command",
                        body,"https://app.zikamansle.fr",cookies);
                    try{
                        int code=conn.getResponseCode();
                        if(code>=200&&code<300)Log.i("ZikaMansle","ZIKA_NATIVE_TEAM_LINKED");
                        else Log.w("ZikaMansle","FCM ZikaTeam linking rejected "+code);
                    }finally{conn.disconnect();}
                }catch(Exception error){Log.w("ZikaMansle","FCM ZikaTeam linking unavailable");}
            },"zika-native-team-link").start();
        });
    }
    private static HttpURLConnection post(String target,JSONObject json,String origin,String cookies)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(target).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setInstanceFollowRedirects(false);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type","application/json");
        if(origin!=null)connection.setRequestProperty("Origin",origin);
        if(cookies!=null)connection.setRequestProperty("Cookie",cookies);
        byte[] bytes=json.toString().getBytes(StandardCharsets.UTF_8);
        try(OutputStream output=connection.getOutputStream()){output.write(bytes);}
        return connection;
    }
    private static void removeServerDevice(Context context,String token){
        try{
            String url=registrationUrl(context);
            if(url==null)return;
            Uri base=Uri.parse(url);
            JSONObject body=new JSONObject();body.put("token",token);
            HttpURLConnection conn=post(base.buildUpon().path("/api/native/unsubscribe").build().toString(),body,null,null);
            try{conn.getResponseCode();}finally{conn.disconnect();}
        }catch(Exception ignored){}
    }
}
