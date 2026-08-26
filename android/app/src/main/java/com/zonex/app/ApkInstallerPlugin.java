package com.zonex.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

// Yuklab olingan APK faylni Android'ning o'z o'rnatish oynasi
// bilan ochadi (avto-yangilanish uchun). Bu narsani JS/Capacitor
// core o'zi qila olmaydi — shuning uchun kichik lokal plagin.
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");

        if (path == null || path.isEmpty()) {
            call.reject("path kerak");
            return;
        }

        Context context = getContext();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
            );
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settingsIntent);

            call.reject("Noma'lum manbadan o'rnatishga ruxsat kerak — sozlamalar ochildi");
            return;
        }

        try {
            File file = new File(path.replace("file://", ""));

            Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                file
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            context.startActivity(installIntent);

            call.resolve();
        } catch (Exception e) {
            call.reject("O'rnatish oynasini ochib bo'lmadi: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        Context context = getContext();

        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || context.getPackageManager().canRequestPackageInstalls();

        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }
}
