package io.github.shuuma4869.lams.core.catalog;

import static org.assertj.core.api.Assertions.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class CatalogMigrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("migration").withUsername("lams").withPassword("test-password");
    private Flyway migration(String schema, String target) {
        return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(),POSTGRES.getUsername(),POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).target(target).load();
    }
    private JdbcTemplate jdbc(String schema) {
        return new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl()+"&currentSchema="+schema,
                POSTGRES.getUsername(),POSTGRES.getPassword()));
    }

    @Test void upgradeFromIdentityRetainsUserAndRole() {
        migration("identity_upgrade","2").migrate();
        var db = jdbc("identity_upgrade"); UUID id=UUID.randomUUID();
        db.update("INSERT INTO users VALUES (?,'M001','test@example.test','test@example.test','Member','test-only','ACTIVE',now(),now())",id);
        db.update("INSERT INTO user_roles VALUES (?,'READER')",id);
        migration("identity_upgrade","latest").migrate();
        assertThat(db.queryForObject("SELECT role_code FROM user_roles WHERE user_id=?",String.class,id)).isEqualTo("READER");
        assertThat(db.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success AND version='11'",Integer.class)).isOne();
    }

    @Test void upgradeRebuildsUnicodeKeysWithoutChangingIdsOrBookRelations() {
        migration("catalog_upgrade","10").migrate();
        var db=jdbc("catalog_upgrade"); UUID category=UUID.randomUUID(),book=UUID.randomUUID();
        db.update("INSERT INTO categories VALUES (?,' Khoa  học ',' khoa  học ')",category);
        db.update("INSERT INTO books(id,title,normalized_title) VALUES (?,' Alpha  Beta ',' alpha  beta ')",book);
        db.update("INSERT INTO book_categories VALUES (?,?)",book,category);
        migration("catalog_upgrade","latest").migrate();
        assertThat(db.queryForObject("SELECT to_regclass('catalog_upgrade.category_aliases') IS NOT NULL", Boolean.class))
                .isTrue();
        assertThat(db.queryForObject("SELECT normalized_name FROM categories WHERE id=?",String.class,category)).isEqualTo("khoa học");
        assertThat(db.queryForObject("SELECT normalized_title FROM books WHERE id=?",String.class,book)).isEqualTo("alpha beta");
        assertThat(db.queryForObject("SELECT category_id FROM book_categories WHERE book_id=?",UUID.class,book)).isEqualTo(category);

        // A second startup against the same already-current schema validates Flyway and is a no-op.
        migration("catalog_upgrade", "latest").migrate();
        assertThat(db.queryForObject("SELECT version FROM flyway_schema_history WHERE success "
                + "ORDER BY installed_rank DESC LIMIT 1", Integer.class)).isEqualTo(28);
        assertThat(db.queryForObject("SELECT count(*) FROM categories WHERE id=?", Integer.class, category)).isOne();
    }

    @Test void failedAliasMigrationLeavesExistingCatalogRowsAndVersion22Untouched() {
        migration("alias_failure", "22").migrate();
        var db=jdbc("alias_failure"); UUID category=UUID.randomUUID(),book=UUID.randomUUID();
        db.update("INSERT INTO categories(id,name,normalized_name) VALUES (?, 'Khoa học', 'khoa học')", category);
        db.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Một cuốn sách','một cuốn sách')",book);
        db.update("INSERT INTO book_categories(book_id,category_id) VALUES (?,?)",book,category);

        // Force V23's first statement to fail; this fixture and existing catalog data must survive.
        db.execute("CREATE TABLE alias_failure.category_aliases(id UUID PRIMARY KEY)");
        db.update("INSERT INTO alias_failure.category_aliases(id) VALUES (?)", UUID.randomUUID());
        assertThatThrownBy(() -> migration("alias_failure", "latest").migrate())
                .isInstanceOf(FlywayException.class);

        assertThat(db.queryForObject("SELECT name FROM categories WHERE id=?",String.class,category))
                .isEqualTo("Khoa học");
        assertThat(db.queryForObject("SELECT category_id FROM book_categories WHERE book_id=?",UUID.class,book))
                .isEqualTo(category);
        assertThat(db.queryForObject("SELECT count(*) FROM alias_failure.category_aliases",Integer.class)).isOne();
        assertThat(db.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success AND version='23'",
                Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT max(version::integer) FROM flyway_schema_history WHERE success",
                Integer.class)).isEqualTo(22);
    }

    @Test void historicalCollisionFailsAtomicallyWithoutDeletingOrMergingRows() {
        migration("collision","10").migrate();
        var db=jdbc("collision"); UUID first=UUID.randomUUID(),second=UUID.randomUUID();
        db.update("INSERT INTO categories VALUES (?,'Khoa học','khoa học'), (?,' Khoa học ',' khoa học ')",first,second);
        assertThatThrownBy(() -> migration("collision","latest").migrate()).isInstanceOf(FlywayException.class)
                .hasStackTraceContaining("Category normalization collision");
        assertThat(db.queryForObject("SELECT count(*) FROM categories",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT normalized_name FROM categories WHERE id=?",String.class,second)).isEqualTo(" khoa học ");
        assertThat(db.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version='11'",Integer.class)).isZero();
        db.update("UPDATE categories SET name='Khoa học ứng dụng',normalized_name='khoa học ứng dụng' WHERE id=?",second);
        migration("collision","latest").migrate();
        assertThat(db.queryForObject("SELECT count(*) FROM categories",Integer.class)).isEqualTo(2);
    }
    @Test void mediaRevisionUpgradePreservesExistingRowsAndStartsAboveTheirVersions() {
        migration("media_upgrade","12").migrate();
        var db=jdbc("media_upgrade"); UUID actor=UUID.randomUUID(),author=UUID.randomUUID(),media=UUID.randomUUID();
        db.update("INSERT INTO users VALUES (?,'M002','media@example.test','media@example.test','Member','test-only','ACTIVE',now(),now())",actor);
        db.update("INSERT INTO authors(id,name) VALUES (?,'Author')",author);
        db.update("INSERT INTO catalog_media_references(id,author_id,source,source_id,source_url,image_url,license,license_url,attribution,evidence,mime,byte_size,approved_by,approved_at,version) "
                + "VALUES (?,?,'wikimedia','Q1','https://commons.wikimedia.org/wiki/File:A.jpg','https://upload.wikimedia.org/A.jpg','CC BY 4.0','https://creativecommons.org/licenses/by/4.0/','Author','Verified','image/jpeg',3,?,now(),41)",media,author,actor);
        migration("media_upgrade","latest").migrate();
        assertThat(db.queryForObject("SELECT version FROM catalog_media_references WHERE id=?",Long.class,media)).isEqualTo(41);
        assertThat(db.queryForObject("SELECT nextval('catalog_media_revision_seq')",Long.class)).isEqualTo(42);
        assertThat(db.queryForObject("SELECT column_default FROM information_schema.columns WHERE table_schema='media_upgrade' AND table_name='catalog_media_references' AND column_name='version'",String.class)).contains("catalog_media_revision_seq");
    }

    @Test void externalSourceUpgradeKeepsExistingBookAndRejectsDuplicateSourceId() {
        migration("catalog_source_upgrade", "24").migrate();
        var db = jdbc("catalog_source_upgrade");
        UUID book = UUID.randomUUID();
        db.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Sách đang có','sach dang co')", book);
        migration("catalog_source_upgrade", "latest").migrate();
        assertThat(db.queryForObject("SELECT title FROM books WHERE id=?", String.class, book)).isEqualTo("Sách đang có");
        String insert = "INSERT INTO catalog_external_sources(source_code,source_record_id,book_id,source_url,"
                + "source_snapshot_sha256,source_title,source_authors) VALUES (?,?,?,?,?,?,?)";
        Object[] values = {"PROJECT_GUTENBERG", "11", book, "https://www.gutenberg.org/ebooks/11",
                "a".repeat(64), "Alice's Adventures in Wonderland", "Carroll, Lewis"};
        db.update(insert, values);
        assertThat(db.queryForObject("SELECT book_id FROM catalog_external_sources WHERE source_record_id='11'",
                UUID.class)).isEqualTo(book);
        assertThatThrownBy(() -> db.update(insert, values))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
