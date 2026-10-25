package io.github.shuuma4869.lams.core.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.yaml.snakeyaml.Yaml;

@SpringBootTest
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class CatalogIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("lams_core").withUsername("lams").withPassword("test-password");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "integration-test-secret-with-at-least-32-bytes");
    }

    @Autowired JdbcTemplate jdbc;

    @Test
    void freshDatabaseAppliesAllCatalogAndInventoryMigrations() {
        assertThat(jdbc.queryForObject("SELECT version FROM flyway_schema_history WHERE success "
                + "ORDER BY installed_rank DESC LIMIT 1", Integer.class)).isEqualTo(21);
        for (String table : new String[]{"authors", "categories", "publishers", "books", "book_authors",
                "book_categories", "editions", "branches", "shelves", "book_copies", "catalog_media_references",
                "favorites", "reviews", "loans", "circulation_requests", "copy_state_changes",
                "inventory_sessions", "inventory_snapshots", "inventory_scans", "inventory_anomalies", "inventory_resolutions"}) {
            assertThat(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class,
                    "public." + table)).as("bảng %s", table).isTrue();
        }
        var bookColumns = jdbc.queryForList("SELECT column_name FROM information_schema.columns "
                + "WHERE table_schema='public' AND table_name='books'", String.class);
        assertThat(bookColumns).contains("title", "normalized_title", "description")
                .doesNotContain("available", "total", "barcode");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname='public' "
                + "AND indexname IN ('uq_shelves_branch_code','book_copies_barcode_key','book_authors_pkey',"
                + "'book_categories_pkey')", Integer.class)).isEqualTo(4);
    }

    @Test
    @SuppressWarnings("unchecked")
    void openApiPublishesImplementedCatalogRoutesAndKeepsBookEditionCopySeparate() throws Exception {
        try (var stream = Files.newInputStream(Path.of("../../contracts/openapi/core-api.yaml"))) {
            var document = (Map<String, Object>) new Yaml().load(stream);
            var paths = (Map<String, Object>) document.get("paths");
            for (String path : new String[]{"/authors", "/categories", "/publishers", "/books",
                    "/books/{bookId}/editions", "/me/favorites", "/me/favorites/{bookId}",
                    "/books/{bookId}/reviews", "/books/{bookId}/reviews/{reviewId}",
                    "/books/{bookId}/reviews/summary", "/branches", "/shelves", "/copies",
                    "/copies/{copyId}/state", "/loans", "/loans/{loanId}/return"}) {
                assertThat(paths).as("đường dẫn %s", path).containsKey(path);
            }
            var schemas = (Map<String, Object>) ((Map<String, Object>) document.get("components")).get("schemas");
            assertThat(schemas).containsKeys("Book", "Edition", "BookCopy", "Favorite", "Review", "RatingSummary");
            var favorite = (Map<String, Object>) schemas.get("Favorite");
            assertThat(((Map<String, Object>) favorite.get("properties")).keySet())
                    .containsExactlyInAnyOrder("bookId", "bookTitle", "favoritedAt");
            var review = (Map<String, Object>) schemas.get("Review");
            assertThat(((Map<String, Object>) review.get("properties")).keySet())
                    .containsExactlyInAnyOrder("reviewId", "bookId", "body", "rating", "createdAt", "updatedAt", "mine")
                    .doesNotContain("userId", "email", "fullName");
            var rating = (Map<String, Object>) schemas.get("RatingSummary");
            assertThat(((Map<String, Object>) rating.get("properties")).keySet())
                    .containsExactlyInAnyOrder("bookId", "average", "count");
            var favoriteMethods = (Map<String, Object>) paths.get("/me/favorites/{bookId}");
            assertThat(favoriteMethods).containsKeys("put", "delete");
            var reviewMethods = (Map<String, Object>) paths.get("/books/{bookId}/reviews/{reviewId}");
            assertThat(reviewMethods).containsKeys("patch", "delete");
            var book = (Map<String, Object>) schemas.get("Book");
            assertThat((Map<String, Object>) book.get("properties")).doesNotContainKeys("barcode", "available", "total");
            var copy = (Map<String, Object>) schemas.get("BookCopy");
            assertThat((Map<String, Object>) copy.get("properties")).containsKeys("editionId", "shelfId", "barcode", "status", "version");
        }
    }
}
