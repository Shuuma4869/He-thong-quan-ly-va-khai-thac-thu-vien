package io.github.shuuma4869.lams.core.shared.api;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.shuuma4869.lams.core.shared.config.SecurityConfig;
import io.github.shuuma4869.lams.core.shared.security.SecurityProblemWriter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
        value = HealthController.class,
        properties = {"spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration",
                "lams.auth.jwt-secret=health-test-secret-with-at-least-32-bytes"})
@Import({SecurityConfig.class, SecurityProblemWriter.class})
class HealthControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldExposePublicHealthEndpoint() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.service", is("lams-core-service")))
                .andExpect(jsonPath("$.status", is("UP")));
    }
}
