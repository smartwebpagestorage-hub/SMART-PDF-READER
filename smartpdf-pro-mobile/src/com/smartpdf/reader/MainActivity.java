package com.smartpdf.reader;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    public static final int FILE_CHOOSER_REQUEST = 1001;
    public static final String APP_ORIGIN = "https://smartpdf.local";

    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;
    private boolean isPageLoaded = false;
    private byte[] intentPdfBytes = null;
    private String intentPdfName = "document.pdf";
    private String pendingPdfBase64 = null;
    private String pendingPdfName = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Modern System Bars (Status bar & Navigation bar)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            getWindow().setStatusBarColor(Color.parseColor("#2563eb"));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getWindow().setNavigationBarColor(Color.parseColor("#f8fafc"));
                View decor = getWindow().getDecorView();
                decor.setSystemUiVisibility(decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        }

        // Handle opening PDF if launched via Intent (WhatsApp, File Manager, Open With)
        handleIncomingIntent(getIntent());

        webView = new WebView(this);
        setContentView(webView);

        // Android 15+ (targetSdk 35) Edge-to-Edge safe insets so system bars/IME never overlap WebView UI
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().getDecorView().setBackgroundColor(Color.parseColor("#2563eb"));
            webView.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    Insets sys = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    Insets ime = insets.getInsets(WindowInsets.Type.ime());
                    int bottom = Math.max(sys.bottom, ime.bottom);
                    v.setPadding(sys.left, sys.top, sys.right, bottom);
                    return WindowInsets.CONSUMED;
                }
            });
        }

        setupWebView(webView);
        webView.loadUrl(APP_ORIGIN + "/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_SEND.equals(action)) {
            Uri dataUri = intent.getData();
            if (dataUri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
                dataUri = intent.getClipData().getItemAt(0).getUri();
            }
            if (dataUri == null && intent.hasExtra(Intent.EXTRA_STREAM)) {
                dataUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }
            if (dataUri != null) {
                loadPdfFromUri(dataUri);
            }
        }
    }

    private void loadPdfFromUri(final Uri uri) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    InputStream is = getContentResolver().openInputStream(uri);
                    if (is == null) return;

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = is.read(buffer)) != -1) {
                        baos.write(buffer, 0, read);
                    }
                    is.close();

                    final byte[] bytes = baos.toByteArray();
                    final String fileName = resolveFileName(uri);

                    synchronized (MainActivity.this) {
                        intentPdfBytes = bytes;
                        intentPdfName = fileName;
                        if (bytes.length < 2 * 1024 * 1024) {
                            pendingPdfBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                            pendingPdfName = fileName;
                        }
                    }

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isPageLoaded && webView != null) {
                                // Trigger immediate load via API stream
                                webView.evaluateJavascript("if (window.initDesktopIntegration) { window.initDesktopIntegration(); }", null);
                            }
                        }
                    });
                } catch (Exception e) {
                    Log.e("SmartPdf", "Error reading PDF uri: " + e.getMessage(), e);
                }
            }
        }).start();
    }

    private String resolveFileName(Uri uri) {
        String fileName = null;
        if ("content".equals(uri.getScheme())) {
            try {
                Cursor cursor = getContentResolver().query(uri, null, null, null, null);
                if (cursor != null) {
                    if (cursor.moveToFirst()) {
                        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (index >= 0) {
                            fileName = cursor.getString(index);
                        }
                    }
                    cursor.close();
                }
            } catch (Exception ignored) {}
        }
        if (fileName == null || fileName.isEmpty()) {
            fileName = uri.getLastPathSegment();
        }
        if (fileName == null || fileName.isEmpty() || !fileName.toLowerCase().endsWith(".pdf")) {
            fileName = "document.pdf";
        }
        return fileName;
    }

    public synchronized void dispatchPendingPdf() {
        if (webView == null || pendingPdfBase64 == null) return;
        String safeB64 = JSONObject.quote(pendingPdfBase64);
        String safeName = JSONObject.quote(pendingPdfName != null ? pendingPdfName : "document.pdf");
        String js = "if (window.loadPdfFromAndroid) { window.loadPdfFromAndroid(" + safeB64 + ", " + safeName + "); }";
        webView.evaluateJavascript(js, null);
        pendingPdfBase64 = null;
        pendingPdfName = null;
    }

    public synchronized String getPendingPdfBase64() {
        return pendingPdfBase64;
    }

    public synchronized String getPendingPdfName() {
        return pendingPdfName;
    }

    public synchronized void clearPendingPdf() {
        pendingPdfBase64 = null;
        pendingPdfName = null;
    }

    private void setupWebView(WebView wv) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(false);
        }
        WebSettings settings = wv.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        wv.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return true;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme() : "";
                String host = uri.getHost() != null ? uri.getHost() : "";
                if ("https".equalsIgnoreCase(scheme) && "smartpdf.local".equalsIgnoreCase(host)) {
                    return false;
                }
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    try {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(browserIntent);
                    } catch (Exception ignored) {}
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return null;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme() : "";
                String host = uri.getHost() != null ? uri.getHost() : "";

                if ("https".equalsIgnoreCase(scheme) && host.equalsIgnoreCase("smartpdf.local")) {
                    String rawPath = uri.getPath() != null ? uri.getPath().replaceAll("^/+", "") : "";

                    // Stream Intent PDF directly (Fast & memory safe for any file size)
                    if (rawPath.equalsIgnoreCase("api/initial-pdf") || rawPath.equalsIgnoreCase("api/intent-pdf")) {
                        byte[] data;
                        String name;
                        synchronized (MainActivity.this) {
                            data = intentPdfBytes;
                            name = intentPdfName;
                        }
                        if (data != null && data.length > 0) {
                            Map<String, String> headers = new HashMap<String, String>();
                            headers.put("Access-Control-Allow-Origin", "https://smartpdf.local");
                            headers.put("Access-Control-Expose-Headers", "X-Pdf-Filename");
                            headers.put("X-Pdf-Filename", Uri.encode(name));
                            return new WebResourceResponse("application/pdf", null, 200, "OK", headers, new ByteArrayInputStream(data));
                        } else {
                            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
                        }
                    }

                    String assetPath = (rawPath.isEmpty() || rawPath.equals("/")) ? "index.html" : rawPath;
                    return createAssetResponse(assetPath);
                }

                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                isPageLoaded = true;

                // Hide PWA install button in native APK
                view.evaluateJavascript(
                    "(function() { var b = document.getElementById('btnInstallApp'); if(b) b.style.display='none'; })();",
                    null
                );

                // Open pending PDF if opened via file manager/WhatsApp
                if (intentPdfBytes != null) {
                    view.evaluateJavascript("if (window.initDesktopIntegration) { window.initDesktopIntegration(); }", null);
                } else if (pendingPdfBase64 != null) {
                    dispatchPendingPdf();
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e("SmartPdf", "WebView Error (" + errorCode + "): " + description + " on " + failingUrl);
            }
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> filePathCallback, FileChooserParams params) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/pdf", "image/*", "*/*" });
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(Intent.createChooser(intent, "PDF फ़ाइल चुनें"), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("*/*");
                    fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(fallback, FILE_CHOOSER_REQUEST);
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                if (msg != null) {
                    Log.d("SmartPdfJS", "[" + msg.sourceId() + ":" + msg.lineNumber() + "] " + msg.message());
                }
                return true;
            }
        });
    }

    private WebResourceResponse createAssetResponse(String assetPath) {
        String cleanPath = assetPath.split("\\?")[0].split("#")[0];
        String normalized = cleanPath.replace('\\', '/').replaceAll("^/+", "");
        if (normalized.contains("..")) {
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, new ByteArrayInputStream(new byte[0]));
        }
        String mime = getMimeType(normalized);

        InputStream is = null;
        try {
            is = getAssets().open(normalized);
        } catch (Exception e1) {
            try {
                is = getAssets().open(normalized.replace('/', '\\'));
            } catch (Exception e2) {
                String fileName = normalized.contains("/") ? normalized.substring(normalized.lastIndexOf('/') + 1) : normalized;
                try {
                    is = getAssets().open(fileName);
                } catch (Exception e3) {
                    is = new ByteArrayInputStream(new byte[0]);
                }
            }
        }

        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.put("Access-Control-Allow-Headers", "*");
        headers.put("Cache-Control", "no-cache, no-store, must-revalidate");

        String encoding = (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg")) ? "UTF-8" : null;
        return new WebResourceResponse(mime, encoding, 200, "OK", headers, is);
    }

    private String getMimeType(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileUploadCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{ data.getData() };
                }
            }
            fileUploadCallback.onReceiveValue(results);
            fileUploadCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
