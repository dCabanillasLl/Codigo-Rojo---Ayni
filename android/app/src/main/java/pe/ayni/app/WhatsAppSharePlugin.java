package pe.ayni.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.IOException;
import java.util.Locale;

@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text");
        String fileUri = call.getString("fileUri");
        if (text == null || text.trim().isEmpty() || text.length() > 8000 || fileUri == null) {
            call.reject("Prepara el mensaje y el flyer antes de compartir.", "INVALID_SHARE_DATA");
            return;
        }
        try {
            Uri source = Uri.parse(fileUri);
            if (!"file".equals(source.getScheme()) || source.getPath() == null ||
                (source.getAuthority() != null && !source.getAuthority().isEmpty())) {
                call.reject("No pudimos abrir el flyer preparado.", "INVALID_FLYER");
                return;
            }
            File root = new File(getContext().getCacheDir(), "ayni-share").getCanonicalFile();
            File image = new File(source.getPath()).getCanonicalFile();
            if (!image.getPath().startsWith(root.getPath() + File.separator) || !image.isFile() ||
                image.length() == 0 || image.length() > 5L * 1024 * 1024) {
                call.reject("El flyer debe estar preparado en la caché de AYNI y pesar hasta 5 MB.", "INVALID_FLYER");
                return;
            }
            String name = image.getName().toLowerCase(Locale.ROOT);
            String mime = name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg" :
                name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : null;
            if (mime == null) {
                call.reject("El flyer debe ser JPG, PNG o WebP.", "INVALID_FLYER");
                return;
            }
            String target = installedWhatsApp();
            if (target == null) {
                call.reject("No encontramos WhatsApp instalado. Puedes compartir solo el mensaje desmarcando el flyer.", "WHATSAPP_NOT_INSTALLED");
                return;
            }
            Uri contentUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", image);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setPackage(target);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.putExtra(Intent.EXTRA_STREAM, contentUri);
            intent.setClipData(ClipData.newRawUri("Flyer de AYNI", contentUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(intent);
                    // Opening WhatsApp does not mean that the user has sent the message.
                    JSObject result = new JSObject();
                    result.put("opened", true);
                    call.resolve(result);
                } catch (ActivityNotFoundException | SecurityException ex) {
                    call.reject("No pudimos abrir WhatsApp con el flyer. Inténtalo nuevamente.", "WHATSAPP_UNAVAILABLE");
                }
            });
        } catch (IOException | IllegalArgumentException | SecurityException ex) {
            call.reject("No pudimos acceder al flyer preparado. Vuelve a abrir el aviso.", "INVALID_FLYER");
        }
    }

    private String installedWhatsApp() {
        PackageManager manager = getContext().getPackageManager();
        for (String name : new String[] { "com.whatsapp", "com.whatsapp.w4b" }) {
            try {
                if (manager.getApplicationInfo(name, 0).enabled) return name;
            } catch (PackageManager.NameNotFoundException ignored) {
                // Try WhatsApp Business if the regular app is not installed.
            }
        }
        return null;
    }
}
