package pe.ayni.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(name = "AyniVoice")
public class AyniVoicePlugin extends Plugin {
    private TextToSpeech speech;
    private boolean ready;
    private boolean recognizing;
    private PluginCall pendingSpeech;
    private PluginCall readingCall;
    private String readingPrefix;
    private String lastUtterance;

    @PluginMethod
    public void recognize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizing) {
                call.reject("Ya hay un dictado en curso.", "VOICE_BUSY");
                return;
            }
            stopReading();
            // The system activity owns microphone permissions and its listening UI.
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-PE");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Cuéntanos qué necesitas");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            try {
                recognizing = true;
                startActivityForResult(call, intent, "recognitionResult");
            } catch (ActivityNotFoundException | SecurityException ex) {
                recognizing = false;
                call.reject("No se pudo abrir el dictado. Activa un servicio de reconocimiento de voz en Android y revisa sus permisos de micrófono.", "VOICE_UNAVAILABLE");
            }
        });
    }

    @ActivityCallback
    private void recognitionResult(PluginCall call, ActivityResult result) {
        recognizing = false;
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Intent data = result.getData();
        ArrayList<String> matches = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (result.getResultCode() != Activity.RESULT_OK || matches == null || matches.isEmpty() || matches.get(0).trim().isEmpty()) {
            call.reject("No se detectó texto. Vuelve a dictar y revisa el micrófono y la conexión.", "NO_SPEECH");
            return;
        }
        JSObject response = new JSObject();
        response.put("text", matches.get(0));
        call.resolve(response);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) { call.reject("Escribe un mensaje para escucharlo."); return; }
        getActivity().runOnUiThread(() -> {
            stopReading();
            if (ready) { read(call); return; }
            pendingSpeech = call;
            if (speech != null) return;
            speech = new TextToSpeech(getContext(), status -> getActivity().runOnUiThread(() -> {
                ready = status == TextToSpeech.SUCCESS;
                PluginCall pending = pendingSpeech;
                pendingSpeech = null;
                if (!ready) {
                    if (speech != null) speech.shutdown();
                    speech = null;
                    if (pending != null) pending.reject("Activa un motor de texto a voz en los ajustes de Android.");
                } else {
                    speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onDone(String id) {
                            getActivity().runOnUiThread(() -> {
                                if (readingCall != null && id.equals(lastUtterance)) {
                                    readingCall.resolve();
                                    readingCall = null;
                                }
                            });
                        }
                        @Override public void onError(String id) {
                            getActivity().runOnUiThread(() -> {
                                if (readingCall != null && id.startsWith(readingPrefix)) {
                                    readingCall.reject("No pudimos reproducir el texto. Revisa el motor de voz de Android.");
                                    readingCall = null;
                                    speech.stop();
                                }
                            });
                        }
                    });
                    if (pending != null) read(pending);
                }
            }));
        });
    }

    private void read(PluginCall call) {
        int language = speech.setLanguage(Locale.forLanguageTag("es-PE"));
        if (language < 0) language = speech.setLanguage(Locale.forLanguageTag("es"));
        if (language < 0) { call.reject("Instala una voz en español en los ajustes de Android."); return; }
        String text = call.getString("text", "").trim();
        // Requests can exceed the engine's per-utterance input limit.
        int limit = TextToSpeech.getMaxSpeechInputLength() - 1;
        readingCall = call;
        readingPrefix = "ayni-" + call.getCallbackId() + "-";
        lastUtterance = readingPrefix + ((text.length() - 1) / limit * limit);
        for (int offset = 0; offset < text.length(); offset += limit) {
            int result = speech.speak(text.substring(offset, Math.min(offset + limit, text.length())),
                offset == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, readingPrefix + offset);
            if (result == TextToSpeech.ERROR) {
                readingCall = null;
                speech.stop();
                call.reject("No pudimos reproducir el texto. Revisa el motor de voz de Android.");
                return;
            }
        }
    }

    private void stopReading() {
        if (pendingSpeech != null) { pendingSpeech.resolve(); pendingSpeech = null; }
        if (readingCall != null) { readingCall.resolve(); readingCall = null; }
        if (speech != null) speech.stop();
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        getActivity().runOnUiThread(() -> { stopReading(); call.resolve(); });
    }

    @Override
    protected void handleOnDestroy() {
        stopReading();
        if (speech != null) { speech.shutdown(); speech = null; }
        ready = false;
    }
}
