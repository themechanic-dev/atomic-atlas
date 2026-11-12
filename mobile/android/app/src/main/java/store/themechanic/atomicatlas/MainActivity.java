package store.themechanic.atomicatlas;

import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    /** When the page was last started again after its renderer stopped, to avoid a loop. */
    private static long lastRecovery = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins are registered before the bridge starts.
        registerPlugin(SpeechPlugin.class);
        registerPlugin(AssistantPlugin.class);
        super.onCreate(savedInstanceState);
        // If the system stops the page's renderer (for example to free memory while the
        // assistant runs), the page is started again instead of the whole app closing.
        // A second stop soon after is left to crash, so a fault at start cannot loop.
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                long now = SystemClock.elapsedRealtime();
                if (lastRecovery != 0 && now - lastRecovery < 30_000) return false;
                lastRecovery = now;
                Log.w("AtomicAtlas", "The page renderer stopped (crash: " + detail.didCrash() + "); starting the page again.");
                recreate();
                return true;
            }
        });
    }
}
