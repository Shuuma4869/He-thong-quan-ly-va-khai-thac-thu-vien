package io.github.shuuma4869.lams.core.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class Phase3MigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("phase3_migrations").withUsername("lams").withPassword("test-password");

    private Flyway migration(String schema, String target) {
        return Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).target(target).load();
    }

    private JdbcTemplate jdbc(String schema) {
        return new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl() + "&currentSchema=" + schema,
                POSTGRES.getUsername(), POSTGRES.getPassword()));
    }

    @Test
    void freshDatabaseAppliesPhase3MigrationsAndConstraints() {
        migration("phase3_fresh", "latest").migrate();
        var db = jdbc("phase3_fresh");
        assertThat(db.queryForObject("SELECT version::integer FROM flyway_schema_history WHERE success "
                        + "ORDER BY installed_rank DESC LIMIT 1",
                Integer.class)).isEqualTo(15);
        assertThat(db.queryForObject("SELECT to_regclass('phase3_fresh.favorites') IS NOT NULL", Boolean.class)).isTrue();
        assertThat(db.queryForObject("SELECT to_regclass('phase3_fresh.reviews') IS NOT NULL", Boolean.class)).isTrue();
        assertThat(db.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname='phase3_fresh' "
                + "AND indexname IN ('pk_favorites','ix_favorites_user_created_book','ix_favorites_book_user',"
                + "'uq_reviews_user_book','ix_reviews_book_created_id')", Integer.class)).isEqualTo(5);
    }

    @Test
    void upgradeFromV13PreservesIdentityAndCatalogAndEnforcesApprovedDeleteRules() {
        String schema = "phase3_upgrade";
        migration(schema, "13").migrate();
        var db = jdbc(schema);
        UUID owner = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();
        UUID favoriteBook = UUID.randomUUID();
        UUID reviewedBook = UUID.randomUUID();
        db.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                + "VALUES (?,?,?,?,'Existing user','test-only','ACTIVE',now(),now()),"
                + "(?,?,?,?,'Second user','test-only','ACTIVE',now(),now())",
                owner, "P3-" + owner.toString().substring(0, 8), owner + "@upgrade.test", owner + "@upgrade.test",
                secondUser, "P3-" + secondUser.toString().substring(0, 8), secondUser + "@upgrade.test", secondUser + "@upgrade.test");
        db.update("INSERT INTO user_roles(user_id,role_code) VALUES (?,'READER'),(?,'READER')", owner, secondUser);
        db.update("INSERT INTO books(id,title,normalized_title) VALUES (?, 'Favorite book','favorite book'),"
                + "(?, 'Reviewed book','reviewed book')", favoriteBook, reviewedBook);

        migration(schema, "latest").migrate();
        assertThat(db.queryForObject("SELECT count(*) FROM users WHERE id IN (?,?)", Integer.class, owner, secondUser)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM books WHERE id IN (?,?)", Integer.class, favoriteBook, reviewedBook)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT version::integer FROM flyway_schema_history WHERE success "
                        + "ORDER BY installed_rank DESC LIMIT 1",
                Integer.class)).isEqualTo(15);

        db.update("INSERT INTO favorites(user_id,book_id) VALUES (?,?)", owner, favoriteBook);
        assertThatThrownBy(() -> db.update("INSERT INTO favorites(user_id,book_id) VALUES (?,?)", owner, favoriteBook))
                .isInstanceOf(DataIntegrityViolationException.class);
        db.update("DELETE FROM books WHERE id=?", favoriteBook);
        assertThat(db.queryForObject("SELECT count(*) FROM favorites WHERE book_id=?", Integer.class, favoriteBook)).isZero();

        db.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Existing review',4)",
                UUID.randomUUID(), owner, reviewedBook);
        assertThatThrownBy(() -> db.update("DELETE FROM books WHERE id=?", reviewedBook))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Bad rating',6)",
                UUID.randomUUID(), secondUser, reviewedBook)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Bad rating',0)",
                UUID.randomUUID(), secondUser, reviewedBook)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> db.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Duplicate',5)",
                UUID.randomUUID(), owner, reviewedBook)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
