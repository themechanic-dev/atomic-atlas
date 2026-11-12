package store.themechanic.atomicatlas;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * The app's voice on Android: the phone's own text-to-speech (for Greek, usually Google's,
 * which works offline). Nothing is listened to; the app only speaks.
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> ready = status == TextToSpeech.SUCCESS);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {}

            @Override
            public void onDone(String id) {
                notifyListeners("done", new JSObject());
            }

            @Override
            public void onError(String id) {
                notifyListeners("done", new JSObject());
            }
        });
    }

    private Locale localeFor(String language) {
        return "el".equals(language) ? new Locale("el", "GR") : Locale.US;
    }

    /** Whether the phone can speak the language: 'yes', 'missing' (voice data not installed) or 'no'. */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        if (!ready || tts == null) {
            result.put("state", "starting");
        } else {
            int code = tts.isLanguageAvailable(localeFor(call.getString("language", "en")));
            result.put("state", code >= TextToSpeech.LANG_AVAILABLE ? "yes" : code == TextToSpeech.LANG_MISSING_DATA ? "missing" : "no");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (!ready || tts == null || text == null || text.isEmpty()) {
            call.reject("not ready");
            return;
        }
        tts.setLanguage(localeFor(call.getString("language", "en")));
        Double rate = call.getDouble("rate", 1.0);
        tts.setSpeechRate(rate == null ? 1.0f : rate.floatValue());
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "atomic-atlas");
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }
}
