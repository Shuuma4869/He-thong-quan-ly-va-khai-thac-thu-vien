package io.github.shuuma4869.lams.core.support;

import org.testcontainers.containers.PostgreSQLContainer;

/** Dùng làm base cho integration test cần PostgreSQL thật ở các feature tiếp theo. */
public abstract class PostgresContainerFoundation {
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:17.6-alpine")
                    .withDatabaseName("lams_test")
                    .withUsername("lams")
                    .withPassword("lams-test-password");
}
