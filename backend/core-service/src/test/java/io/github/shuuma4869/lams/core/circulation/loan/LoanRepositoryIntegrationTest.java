package io.github.shuuma4869.lams.core.circulation.loan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.shuuma4869.lams.core.circulation.loan.infrastructure.LoanRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
class LoanRepositoryIntegrationTest {
    @Container static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:17.6-alpine");
    @DynamicPropertySource static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", DB::getJdbcUrl);
        properties.add("spring.datasource.username", DB::getUsername);
        properties.add("spring.datasource.password", DB::getPassword);
        properties.add("lams.auth.jwt-secret", () -> "loan-repository-test-secret-at-least-32-bytes");
    }
    @Autowired LoanRepository loans;
    @Autowired PlatformTransactionManager transactions;

    @Test void writesAndLocksRequireAnExistingTransactionThroughSpringProxy() {
        assertThatThrownBy(() -> loans.insert(null)).isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> loans.lock(UUID.randomUUID())).isInstanceOf(IllegalTransactionStateException.class);
        var result = new TransactionTemplate(transactions).execute(s -> loans.lock(UUID.randomUUID()));
        assertThat(result).isEmpty();
    }
}
