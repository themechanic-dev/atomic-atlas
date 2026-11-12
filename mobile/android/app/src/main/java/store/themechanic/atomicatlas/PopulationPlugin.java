package store.themechanic.atomicatlas;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Tiles of the 100 m population grid (GHS-POP 2025, 3 arc-seconds, European Commission JRC)
 * for the offline areas. The JRC server sends no CORS headers, so the page cannot fetch them:
 * this plugin downloads a tile's zip, takes the GeoTIFF out of it and gives the page its path;
 * the page cuts out the area, keeps only that and asks for the tile to be deleted.
 */
@CapacitorPlugin(name = "Population")
public class PopulationPlugin extends Plugin {
    private static final String BASE = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_4326_3ss/V1-0/tiles/GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_";
    private static final Pattern TILE = Pattern.compile("^R\\d{1,2}_C\\d{1,2}$");

    private File folder() {
        File f = new File(getContext().getCacheDir(), "population-tiles");
        f.mkdirs();
        return f;
    }

    private static boolean valid(String name) {
        return name != null && TILE.matcher(name).matches();
    }

    @PluginMethod
    public void fetchTile(PluginCall call) {
        String name = call.getString("name");
        if (!valid(name)) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("error", "bad tile name");
            call.resolve(r);
            return;
        }
        new Thread(() -> {
            JSObject result = new JSObject();
            File zip = new File(folder(), name + ".zip");
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(BASE + name + ".zip").openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(60000);
                int code = connection.getResponseCode();
                if (code == 404) {
                    connection.disconnect();
                    result.put("ok", false);
                    result.put("missing", true);
                    call.resolve(result);
                    return;
                }
                if (code >= 400) throw new Exception("HTTP " + code);
                long total = connection.getContentLengthLong();
                long received = 0;
                long lastReport = 0;
                try (InputStream in = new BufferedInputStream(connection.getInputStream()); OutputStream out = new FileOutputStream(zip)) {
                    byte[] buffer = new byte[1 << 16];
                    int n;
                    while ((n = in.read(buffer)) > 0) {
                        out.write(buffer, 0, n);
                        received += n;
                        if (total > 0 && received - lastReport > 4_000_000) {
                            lastReport = received;
                            JSObject progress = new JSObject();
                            progress.put("share", (double) received / total);
                            notifyListeners("progress", progress);
                        }
                    }
                } finally {
                    connection.disconnect();
                }
                if (total > 0 && received != total) throw new Exception("The download was cut short.");
                // The one GeoTIFF inside the zip.
                boolean found = false;
                try (ZipInputStream entries = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
                    ZipEntry entry;
                    while ((entry = entries.getNextEntry()) != null) {
                        if (!entry.getName().toLowerCase().endsWith(".tif") || entry.getName().contains("/") || entry.getName().contains("\\")) continue;
                        try (OutputStream out = new FileOutputStream(new File(folder(), name + ".tif"))) {
                            byte[] buffer = new byte[1 << 16];
                            int n;
                            while ((n = entries.read(buffer)) > 0) out.write(buffer, 0, n);
                        }
                        found = true;
                        break;
                    }
                }
                if (!found) throw new Exception("No GeoTIFF in the zip.");
                result.put("ok", true);
            } catch (Exception e) {
                result.put("ok", false);
                result.put("error", e.getMessage());
            } finally {
                zip.delete();
            }
            call.resolve(result);
        }).start();
    }

    /** The path of a tile's GeoTIFF, for the page to load (through Capacitor.convertFileSrc). */
    @PluginMethod
    public void tilePath(PluginCall call) {
        String name = call.getString("name");
        JSObject r = new JSObject();
        File tif = valid(name) ? new File(folder(), name + ".tif") : null;
        r.put("path", tif != null && tif.exists() ? tif.getAbsolutePath() : null);
        call.resolve(r);
    }

    @PluginMethod
    public void removeTile(PluginCall call) {
        String name = call.getString("name");
        if (valid(name)) new File(folder(), name + ".tif").delete();
        call.resolve();
    }
}
