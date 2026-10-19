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
        assertThat(db.queryForObject("SELECT normalized_name FROM categories WHERE id=?",String.class,category)).isEqualTo("khoa học");
        assertThat(db.queryForObject("SELECT normalized_title FROM books WHERE id=?",String.class,book)).isEqualTo("alpha beta");
        assertThat(db.queryForObject("SELECT category_id FROM book_categories WHERE book_id=?",UUID.class,book)).isEqualTo(category);
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
}
