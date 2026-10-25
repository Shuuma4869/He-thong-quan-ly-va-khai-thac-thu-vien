package io.github.shuuma4869.lams.core.catalog.publicapi;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class PublicCatalogRateLimitTest {
    @Test void boundsAnonymousRequestsPerNetworkPeerWithoutRestrictingOtherPaths() throws Exception {
        var filter = new PublicCatalogRateLimit();
        for (int number = 0; number < 300; number++) {
            var request = new MockHttpServletRequest("GET", "/api/v1/public/catalog/books");
            request.setRemoteAddr("192.0.2.10");
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, new MockFilterChain());
            assertThat(response.getStatus()).isEqualTo(200);
        }
        var over = new MockHttpServletRequest("GET", "/api/v1/public/catalog/books");
        over.setRemoteAddr("192.0.2.10");
        var rejected = new MockHttpServletResponse();
        filter.doFilter(over, rejected, new MockFilterChain());
        assertThat(rejected.getStatus()).isEqualTo(429);
        assertThat(rejected.getHeader("Retry-After")).isNotBlank();
        var other = new MockHttpServletRequest("GET", "/api/v1/public/catalog/books");
        other.setRemoteAddr("192.0.2.11");
        var allowed = new MockHttpServletResponse();
        filter.doFilter(other, allowed, new MockFilterChain());
        assertThat(allowed.getStatus()).isEqualTo(200);
    }
}
