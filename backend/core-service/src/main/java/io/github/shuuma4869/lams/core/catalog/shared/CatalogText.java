package io.github.shuuma4869.lams.core.catalog.shared;

import java.text.Normalizer;
import java.util.Locale;

public final class CatalogText {
    private CatalogText() {}

    public static String display(String value) {
        return value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFKC)
                .replaceAll("(?U)\\s+", " ").strip();
    }

    public static String key(String value) {
        return display(value).toLowerCase(Locale.ROOT);
    }
}
