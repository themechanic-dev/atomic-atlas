package store.themechanic.atomicatlas;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * The app's voice on Android: the phone's own text-to-speech (for Greek, usually Google's,
 * which works offline). Nothing is listened to; the app only speaks. A named voice of the
 * phone can be asked for (the male English voice); the web side picks it from `voices`.
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

    /** The phone's voices for a language, with the engine's own names and features. */
    @PluginMethod
    public void voices(PluginCall call) {
        JSObject result = new JSObject();
        JSArray list = new JSArray();
        if (ready && tts != null && tts.getVoices() != null) {
            String language = localeFor(call.getString("language", "en")).getLanguage();
            for (Voice voice : tts.getVoices()) {
                if (!language.equals(voice.getLocale().getLanguage())) continue;
                JSObject item = new JSObject();
                item.put("name", voice.getName());
                item.put("locale", voice.getLocale().toLanguageTag());
                item.put("quality", voice.getQuality());
                item.put("network", voice.isNetworkConnectionRequired());
                item.put("installed", voice.getFeatures() == null || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
                item.put("features", voice.getFeatures() == null ? "" : String.join(",", voice.getFeatures()));
                list.put(item);
            }
            result.put("engine", tts.getDefaultEngine());
        }
        result.put("voices", list);
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (!ready || tts == null || text == null || text.isEmpty()) {
            call.reject("not ready");
            return;
        }
        Voice chosen = null;
        String name = call.getString("voice", null);
        if (name != null && tts.getVoices() != null) {
            for (Voice voice : tts.getVoices()) if (voice.getName().equals(name)) chosen = voice;
        }
        if (chosen == null || tts.setVoice(chosen) != TextToSpeech.SUCCESS) tts.setLanguage(localeFor(call.getString("language", "en")));
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
