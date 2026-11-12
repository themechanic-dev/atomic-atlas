package store.themechanic.atomicatlas;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.ServerSocket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The assistant on Android: llama.cpp's llama-server, built for arm64 and shipped inside the
 * app as a native library, run on this phone and reached on 127.0.0.1 only. The model is
 * downloaded from the app, checked against its SHA-256. The web UI sends the conversation
 * and the tools; the tools themselves run in the web UI, as on the desktop.
 */
@CapacitorPlugin(name = "Assistant")
public class AssistantPlugin extends Plugin {
    private static final String[][] MODELS = {
        // size, url, file, bytes, sha256
        { "small", "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf", "Qwen3.5-2B-Q4_K_M.gguf", "1280835840", "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223" },
        { "large", "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf", "Qwen3.5-4B-Q4_K_M.gguf", "2740937888", "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4" },
    };

    private volatile boolean installing = false;
    private volatile String lastError = null;
    private Process server = null;
    private int port = 0;

    private File modelsDir() {
        return new File(getContext().getFilesDir(), "assistant/models");
    }

    private File serverBinary() {
        return new File(getContext().getApplicationInfo().nativeLibraryDir, "libllamaserver.so");
    }

    private String[] installedModel() {
        for (int i = MODELS.length - 1; i >= 0; i--) {
            File f = new File(modelsDir(), MODELS[i][2]);
            File mark = new File(modelsDir(), MODELS[i][2] + ".verified");
            if (f.exists() && mark.exists() && f.length() == Long.parseLong(MODELS[i][3])) return MODELS[i];
        }
        return null;
    }

    private JSObject status() {
        String[] model = installedModel();
        JSObject s = new JSObject();
        s.put("supported", serverBinary().exists());
        s.put("installed", model != null && serverBinary().exists());
        s.put("size", model == null ? null : model[0]);
        s.put("installing", installing);
        s.put("running", server != null && port > 0);
        s.put("device", server != null && port > 0 ? "cpu" : null);
        s.put("needsRuntime", false);
        s.put("error", lastError);
        return s;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void install(PluginCall call) {
        String size = "large".equals(call.getString("size")) ? "large" : "small";
        if (installing) {
            call.resolve(status());
            return;
        }
        installing = true;
        lastError = null;
        new Thread(() -> {
            try {
                stopServer();
                String[] model = "large".equals(size) ? MODELS[1] : MODELS[0];
                File dir = modelsDir();
                dir.mkdirs();
                // One model at a time.
                for (String[] other : MODELS) {
                    if (other == model) continue;
                    new File(dir, other[2]).delete();
                    new File(dir, other[2] + ".verified").delete();
                }
                File target = new File(dir, model[2]);
                File mark = new File(dir, model[2] + ".verified");
                if (!mark.exists()) download(model[1], target, Long.parseLong(model[3]), model[4]);
                try (FileOutputStream out = new FileOutputStream(mark)) {
                    out.write(model[4].getBytes(StandardCharsets.UTF_8));
                }
            } catch (Exception e) {
                lastError = e.getMessage();
            } finally {
                installing = false;
                call.resolve(status());
            }
        }).start();
    }

    private void download(String url, File target, long bytes, String sha256) throws Exception {
        File partial = new File(target.getPath() + ".part");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(30000);
        connection.setReadTimeout(60000);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long received = 0;
        long lastReport = 0;
        try (InputStream in = new BufferedInputStream(connection.getInputStream()); OutputStream out = new FileOutputStream(partial)) {
            byte[] buffer = new byte[1 << 16];
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                digest.update(buffer, 0, n);
                received += n;
                if (received - lastReport > 8_000_000) {
                    lastReport = received;
                    JSObject progress = new JSObject();
                    progress.put("share", (double) received / bytes);
                    notifyListeners("progress", progress);
                }
            }
        } finally {
            connection.disconnect();
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format("%02x", b));
        if (received != bytes || !hex.toString().equals(sha256)) {
            partial.delete();
            throw new Exception("The download was damaged.");
        }
        if (!partial.renameTo(target)) throw new Exception("The download could not be saved.");
    }

    @PluginMethod
    public void remove(PluginCall call) {
        stopServer();
        File dir = modelsDir();
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) f.delete();
        call.resolve(status());
    }

    private synchronized boolean startServer() {
        if (server != null && port > 0) return true;
        String[] model = installedModel();
        if (model == null || !serverBinary().exists()) return false;
        try {
            try (ServerSocket probe = new ServerSocket(0)) {
                port = probe.getLocalPort();
            }
            int threads = Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors() - 2));
            List<String> args = new ArrayList<>();
            args.add(serverBinary().getPath());
            args.add("-m");
            args.add(new File(modelsDir(), model[2]).getPath());
            args.add("--host");
            args.add("127.0.0.1");
            args.add("--port");
            args.add(String.valueOf(port));
            args.add("-c");
            args.add("4096");
            args.add("--jinja");
            args.add("--reasoning");
            args.add("off");
            args.add("--no-webui");
            args.add("-t");
            args.add(String.valueOf(threads));
            ProcessBuilder builder = new ProcessBuilder(args);
            builder.redirectErrorStream(true);
            builder.redirectOutput(new File(getContext().getCacheDir(), "llama-server.log"));
            server = builder.start();
            long started = System.currentTimeMillis();
            while (System.currentTimeMillis() - started < 180000) {
                if (!server.isAlive()) break;
                try {
                    HttpURLConnection health = (HttpURLConnection) new URL("http://127.0.0.1:" + port + "/health").openConnection();
                    health.setConnectTimeout(1000);
                    if (health.getResponseCode() == 200) return true;
                } catch (Exception ignored) {
                    // Not listening yet.
                }
                Thread.sleep(500);
            }
        } catch (Exception e) {
            lastError = e.getMessage();
        }
        stopServer();
        if (lastError == null) lastError = "The assistant could not be started.";
        return false;
    }

    private synchronized void stopServer() {
        if (server != null) server.destroy();
        server = null;
        port = 0;
    }

    @PluginMethod
    public void start(PluginCall call) {
        new Thread(() -> {
            startServer();
            call.resolve(status());
        }).start();
    }

    @PluginMethod
    public void chat(PluginCall call) {
        JSArray messages = call.getArray("messages");
        JSArray tools = call.getArray("tools");
        new Thread(() -> {
            try {
                if (!startServer()) {
                    JSObject error = new JSObject();
                    error.put("error", lastError == null ? "not running" : lastError);
                    call.resolve(error);
                    return;
                }
                JSONObject request = new JSONObject();
                request.put("messages", messages);
                if (tools != null) request.put("tools", tools);
                request.put("temperature", 0.3);
                request.put("max_tokens", 700);
                request.put("stream", true);
                HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:" + port + "/v1/chat/completions").openConnection();
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(600000);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(request.toString().getBytes(StandardCharsets.UTF_8));
                }
                int code = connection.getResponseCode();
                if (code >= 400) {
                    connection.disconnect();
                    JSObject error = new JSObject();
                    error.put("error", String.valueOf(code));
                    call.resolve(error);
                    return;
                }
                call.resolve(readStream(connection));
            } catch (Exception e) {
                JSObject error = new JSObject();
                error.put("error", e.getMessage());
                call.resolve(error);
            }
        }).start();
    }

    /**
     * Reads the server's answer as it is written (server-sent events): each piece of text goes
     * to the web UI at once as a "delta" event, and the whole answer, with any tool calls put
     * together from their pieces, is returned in the usual chat-completion form.
     */
    private JSObject readStream(HttpURLConnection connection) throws Exception {
        StringBuilder content = new StringBuilder();
        List<JSONObject> calls = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (!line.startsWith("data:")) continue;
                String data = line.substring(5).trim();
                if (data.equals("[DONE]")) continue;
                JSONObject delta;
                try {
                    JSONArray choices = new JSONObject(data).optJSONArray("choices");
                    delta = choices == null || choices.length() == 0 ? null : choices.getJSONObject(0).optJSONObject("delta");
                } catch (Exception e) {
                    continue;
                }
                if (delta == null) continue;
                String text = delta.isNull("content") ? "" : delta.optString("content", "");
                if (!text.isEmpty()) {
                    content.append(text);
                    JSObject piece = new JSObject();
                    piece.put("text", text);
                    notifyListeners("delta", piece);
                }
                JSONArray parts = delta.optJSONArray("tool_calls");
                for (int i = 0; parts != null && i < parts.length(); i++) {
                    JSONObject part = parts.getJSONObject(i);
                    int index = part.optInt("index", calls.size());
                    while (calls.size() <= index) {
                        JSONObject fresh = new JSONObject();
                        fresh.put("id", "call_" + calls.size());
                        fresh.put("type", "function");
                        JSONObject function = new JSONObject();
                        function.put("name", "");
                        function.put("arguments", "");
                        fresh.put("function", function);
                        calls.add(fresh);
                    }
                    JSONObject target = calls.get(index);
                    if (part.has("id") && !part.isNull("id")) target.put("id", part.getString("id"));
                    JSONObject function = part.optJSONObject("function");
                    if (function != null) {
                        JSONObject into = target.getJSONObject("function");
                        if (function.has("name") && !function.isNull("name")) into.put("name", into.getString("name") + function.getString("name"));
                        if (function.has("arguments") && !function.isNull("arguments")) into.put("arguments", into.getString("arguments") + function.getString("arguments"));
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
        JSONObject message = new JSONObject();
        message.put("role", "assistant");
        message.put("content", content.toString());
        if (!calls.isEmpty()) message.put("tool_calls", new JSONArray(calls));
        JSONObject choice = new JSONObject();
        choice.put("message", message);
        JSObject result = new JSObject();
        result.put("choices", new JSONArray().put(choice));
        return result;
    }

    @Override
    protected void handleOnDestroy() {
        stopServer();
    }
}
