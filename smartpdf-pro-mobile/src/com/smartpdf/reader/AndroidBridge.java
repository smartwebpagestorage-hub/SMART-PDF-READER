package com.smartpdf.reader;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class AndroidBridge {
    private final MainActivity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public AndroidBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isAndroid() {
        return true;
    }

    @JavascriptInterface
    public void showToast(final String message) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public String getPendingPdfData() {
        return activity.getPendingPdfBase64();
    }

    @JavascriptInterface
    public String getPendingPdfName() {
        return activity.getPendingPdfName();
    }

    @JavascriptInterface
    public void clearPendingPdf() {
        activity.clearPendingPdf();
    }

    @JavascriptInterface
    public void saveFile(final String base64Data, final String fileName, final String mimeType) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String cleanBase64 = base64Data.contains(",")
                            ? base64Data.substring(base64Data.indexOf(",") + 1)
                            : base64Data;
                    byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                    final String cleanName = sanitizeFileName(fileName);

                    final Uri savedUri = saveToDownloads(activity, bytes, cleanName, mimeType);

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (savedUri != null) {
                                Toast.makeText(activity, "✅ फ़ाइल सुरक्षित हुई:\nDownload/SmartPDF/" + cleanName, Toast.LENGTH_LONG).show();
                            } else {
                                Toast.makeText(activity, "❌ फ़ाइल सेव करने में त्रुटि हुई", Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                } catch (final Exception e) {
                    Log.e("SmartPdfBridge", "Error saving file: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(activity, "त्रुटि: " + e.getLocalizedMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }).start();
    }

    @JavascriptInterface
    public void shareFile(final String base64Data, final String fileName, final String mimeType) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String cleanBase64 = base64Data.contains(",")
                            ? base64Data.substring(base64Data.indexOf(",") + 1)
                            : base64Data;
                    byte[] bytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                    final String cleanName = sanitizeFileName(fileName);

                    File cacheFile = new File(activity.getCacheDir(), cleanName);
                    FileOutputStream fos = new FileOutputStream(cacheFile);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();

                    final Uri uri = Uri.parse("content://com.smartpdf.reader.provider/" + cleanName);

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Intent shareIntent = new Intent(Intent.ACTION_SEND);
                            shareIntent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "application/pdf");
                            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
                            shareIntent.putExtra(Intent.EXTRA_SUBJECT, cleanName);
                            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            activity.startActivity(Intent.createChooser(shareIntent, "PDF शेयर करें"));
                        }
                    });
                } catch (final Exception e) {
                    Log.e("SmartPdfBridge", "Error sharing file: " + e.getMessage(), e);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(activity, "शेयर करने में त्रुटि: " + e.getLocalizedMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }).start();
    }

    private String sanitizeFileName(String name) {
        if (name == null || name.trim().isEmpty()) {
            return "SmartPDF_" + System.currentTimeMillis() + ".pdf";
        }
        String n = name.trim().replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!n.toLowerCase().endsWith(".pdf") && !n.contains(".")) {
            n = n + ".pdf";
        }
        return n;
    }

    private Uri saveToDownloads(Context context, byte[] bytes, String fileName, String mimeType) {
        String effectiveMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/pdf";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            values.put(MediaStore.MediaColumns.MIME_TYPE, effectiveMime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SmartPDF");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) return null;

            try {
                OutputStream out = context.getContentResolver().openOutputStream(uri);
                if (out != null) {
                    out.write(bytes);
                    out.flush();
                    out.close();
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                context.getContentResolver().update(uri, values, null, null);
                return uri;
            } catch (Exception e) {
                try {
                    context.getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) {}
                Log.e("SmartPdfBridge", "MediaStore write failed", e);
                return null;
            }
        } else {
            try {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File smartPdfDir = new File(downloadsDir, "SmartPDF");
                if (!smartPdfDir.exists()) smartPdfDir.mkdirs();

                File targetFile = new File(smartPdfDir, fileName);
                FileOutputStream fos = new FileOutputStream(targetFile);
                fos.write(bytes);
                fos.flush();
                fos.close();

                MediaScannerConnection.scanFile(context, new String[]{ targetFile.getAbsolutePath() }, new String[]{ effectiveMime }, null);
                return Uri.fromFile(targetFile);
            } catch (Exception e) {
                Log.e("SmartPdfBridge", "Legacy download write failed", e);
                return null;
            }
        }
    }
}
