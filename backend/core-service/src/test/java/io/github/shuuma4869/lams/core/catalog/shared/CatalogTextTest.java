package io.github.shuuma4869.lams.core.catalog.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.text.Normalizer;
import org.junit.jupiter.api.Test;

class CatalogTextTest {
    @Test
    void nfcAndNfdVietnameseNamesProduceTheSameNormalizedKey() {
        String nfc = Normalizer.normalize("Cà phê", Normalizer.Form.NFC);
        String nfd = Normalizer.normalize(nfc, Normalizer.Form.NFD);

        assertThat(nfc).isNotEqualTo(nfd);
        assertThat(CatalogText.key(nfc)).isEqualTo("cà phê");
        assertThat(CatalogText.key(nfd)).isEqualTo(CatalogText.key(nfc));
    }

    @Test
    void keyIsCaseInsensitiveUsingTheExistingLocaleIndependentRule() {
        assertThat(CatalogText.key("KHOA HỌC"))
                .isEqualTo(CatalogText.key("Khoa học"))
                .isEqualTo(CatalogText.key("khoa học"))
                .isEqualTo("khoa học");
    }

    @Test
    void unicodeWhitespaceIsCollapsedAndTrimmed() {
        String spaced = "\u00a0Khoa\t\u2003  học\u00a0";

        assertThat(CatalogText.display(spaced)).isEqualTo("Khoa học");
        assertThat(CatalogText.key(spaced)).isEqualTo(CatalogText.key("Khoa học"));
    }

    @Test
    void vietnameseDiacriticsArePreservedRatherThanRemoved() {
        assertThat(CatalogText.key("Công nghệ")).isNotEqualTo(CatalogText.key("Cong nghe"));
        assertThat(CatalogText.key("Má")).isNotEqualTo(CatalogText.key("Ma"));
    }

    @Test
    void nfkcCompatibilityCharactersFollowTheExistingKeyRule() {
        assertThat(CatalogText.key("ＫＨＯＡ　HỌC"))
                .isEqualTo(CatalogText.key("KHOA HỌC"))
                .isEqualTo("khoa học");
        assertThat(CatalogText.key("ﬁ")).isEqualTo(CatalogText.key("fi"));
    }
}
