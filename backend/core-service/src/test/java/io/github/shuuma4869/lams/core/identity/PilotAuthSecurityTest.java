package io.github.shuuma4869.lams.core.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.identity.api.AuthController;
import io.github.shuuma4869.lams.core.shared.security.SecurityProblemWriter;
import io.github.shuuma4869.lams.core.shared.security.TrustedAuthOriginFilter;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("pilot")
@Testcontainers
class PilotAuthSecurityTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine");

    @DynamicPropertySource
    static void settings(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "pilot-test-secret-with-at-least-32-bytes");
        registry.add("lams.cors.allowed-origins", () -> "https://tauri.localhost,https://web.example.test");
    }

    @Autowired MockMvc mvc;

    @Test
    void browserPreflightAllowsOnlyConfiguredOriginsAndHeaders() throws Exception {
        mvc.perform(options("/api/v1/auth/login").header("Origin", "https://tauri.localhost")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type,x-lams-client"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://tauri.localhost"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/v1/auth/login").header("Origin", "https://evil.example.test")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "x-lams-client"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossSiteSessionRequiresTrustedOriginAndCustomHeader() throws Exception {
        for (String path : java.util.List.of("register", "login", "refresh", "logout")) {
            mvc.perform(post("/api/v1/auth/" + path)).andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/auth/" + path).header("Origin", "https://tauri.localhost"))
                    .andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/auth/" + path).header("Origin", "https://evil.example.test")
                    .header("X-LAMS-Client", "1")).andExpect(status().isForbidden());
        }
    }

    @Test
    void trustedRegistrationRefreshAndLogoutKeepSecureCookie() throws Exception {
        var registered = mvc.perform(post("/api/v1/auth/register").header("Origin", "https://tauri.localhost")
                .header("X-LAMS-Client", "1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Pilot reader\",\"email\":\"" + UUID.randomUUID()
                        + "@example.test\",\"password\":\"pilot-test-password\"}"))
                .andExpect(status().isCreated()).andReturn();
        String setCookie = registered.getResponse().getHeader("Set-Cookie");
        assertThat(setCookie).contains("Secure", "HttpOnly", "SameSite=None", "Path=/api/v1/auth");
        String token = setCookie.split(";", 2)[0].split("=", 2)[1];
        var refreshed = mvc.perform(post("/api/v1/auth/refresh").header("Origin", "https://tauri.localhost")
                .header("X-LAMS-Client", "1").cookie(new Cookie("lams_refresh", token)))
                .andExpect(status().isOk()).andReturn();
        String rotated = refreshed.getResponse().getHeader("Set-Cookie");
        assertThat(rotated).doesNotContain(token).contains("Secure", "HttpOnly", "SameSite=None");
        var logout = mvc.perform(post("/api/v1/auth/logout").header("Origin", "https://tauri.localhost")
                .header("X-LAMS-Client", "1").cookie(new Cookie("lams_refresh", rotated.split(";", 2)[0].split("=", 2)[1])))
                .andExpect(status().isNoContent()).andReturn();
        assertThat(logout.getResponse().getHeader("Set-Cookie")).contains("Max-Age=0", "Secure", "SameSite=None");
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
    }

    @Test
    void unsafePilotPolicyFailsClosed() {
        assertThatThrownBy(() -> new AuthController(null, false, "None", true)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new AuthController(null, true, "None", false)).isInstanceOf(IllegalArgumentException.class);
        for (String origin : java.util.List.of("*", "http://tauri.localhost", "https://example.test/path", "https://example.test?key=value")) {
            assertThatThrownBy(() -> new TrustedAuthOriginFilter(origin, new SecurityProblemWriter(new ObjectMapper())))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
