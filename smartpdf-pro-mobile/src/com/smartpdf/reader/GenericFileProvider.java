package com.smartpdf.reader;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

public class GenericFileProvider extends ContentProvider {
    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File file = getFileForUri(uri);
            String[] proj = (projection != null) ? projection : new String[]{ OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
            MatrixCursor cursor = new MatrixCursor(proj, 1);
            MatrixCursor.RowBuilder row = cursor.newRow();
            for (String col : proj) {
                if (OpenableColumns.DISPLAY_NAME.equals(col)) {
                    row.add(file.getName());
                } else if (OpenableColumns.SIZE.equals(col)) {
                    row.add(file.length());
                } else {
                    row.add(null);
                }
            }
            return cursor;
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public String getType(Uri uri) {
        try {
            File file = getFileForUri(uri);
            String name = file.getName().toLowerCase();
            if (name.endsWith(".pdf")) return "application/pdf";
            if (name.endsWith(".png")) return "image/png";
            if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
            return "application/octet-stream";
        } catch (Exception e) {
            return "application/octet-stream";
        }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode != null && !mode.equals("r")) {
            throw new SecurityException("Write access is not permitted");
        }
        File file = getFileForUri(uri);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    private File getFileForUri(Uri uri) throws FileNotFoundException {
        Context ctx = getContext();
        if (ctx == null) throw new IllegalStateException("Context is null");
        String path = uri.getPath();
        if (path == null || path.isEmpty()) throw new FileNotFoundException("Empty URI path");
        while (path.startsWith("/")) path = path.substring(1);

        try {
            File cacheDir = ctx.getCacheDir().getCanonicalFile();
            File candidate = new File(cacheDir, path).getCanonicalFile();
            String cachePrefix = cacheDir.getPath() + File.separator;
            if (candidate.getPath().startsWith(cachePrefix) && candidate.exists() && candidate.isFile()) {
                return candidate;
            }

            File extCache = ctx.getExternalCacheDir();
            if (extCache != null) {
                File extCanonical = extCache.getCanonicalFile();
                File extCandidate = new File(extCanonical, path).getCanonicalFile();
                String extPrefix = extCanonical.getPath() + File.separator;
                if (extCandidate.getPath().startsWith(extPrefix) && extCandidate.exists() && extCandidate.isFile()) {
                    return extCandidate;
                }
            }
        } catch (java.io.IOException e) {
            throw new FileNotFoundException("Invalid file path");
        }
        throw new FileNotFoundException("File not found or access denied");
    }
}
