package io.github.shuuma4869.lams.core.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CatalogTextTest {
    @ParameterizedTest
    @ValueSource(strings = {" Khoa  học ", "\u00a0Khoa\u00a0học\u00a0", "\u2003Khoa\t học\u2003", "Ｋhoa học"})
    void normalizesBeforeCollapsingUnicodeWhitespace(String input) {
        assertThat(CatalogText.display(input)).isEqualTo("Khoa học");
        assertThat(CatalogText.key(input)).isEqualTo("khoa học");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "\u00a0", "\u2003\t\n", " \u202f\u0085 "})
    void unicodeWhitespaceOnlyIsEmpty(String input) {
        assertThat(CatalogText.display(input)).isEmpty();
    }
}
