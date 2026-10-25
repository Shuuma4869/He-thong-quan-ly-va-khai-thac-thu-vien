package io.github.shuuma4869.lams.core.catalog.category.infrastructure;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.sql.SQLException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Serializes writes that share the canonical Category/Alias normalized-name namespace. */
@Repository
public class CategoryTermLock {
    private final JdbcTemplate jdbc;

    public CategoryTermLock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void acquire() {
        String isolation = jdbc.queryForObject("SHOW transaction_isolation", String.class);
        if (!"read committed".equalsIgnoreCase(isolation)) {
            throw new AuthFailure(409,
                    "Không thể ghi Category/Alias trong transaction isolation hiện tại; hãy thử lại.");
        }
        jdbc.execute("SET LOCAL lock_timeout = '5s'");
        try {
            jdbc.execute("SELECT pg_advisory_xact_lock(hashtextextended('lams:catalog:category-term', 0))");
        } catch (DataAccessException failure) {
            if (sqlState(failure, "55P03")) {
                throw new AuthFailure(409,
                        "Không thể khóa không gian Category/Alias vì đang có giao dịch khác; vui lòng thử lại.");
            }
            throw failure;
        }
    }

    private static boolean sqlState(Throwable failure, String expected) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && expected.equals(sql.getSQLState())) return true;
        }
        return false;
    }
}
