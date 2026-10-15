package io.github.shuuma4869.lams.core.shared.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.web.filter.OncePerRequestFilter;

/** Cross-site refresh cookies require an explicit trusted origin and a non-simple header. */
public final class TrustedAuthOriginFilter extends OncePerRequestFilter {
    private final Set<String> origins;
    private final SecurityProblemWriter problems;

    public TrustedAuthOriginFilter(String configuredOrigins, SecurityProblemWriter problems) {
        origins = Arrays.stream(configuredOrigins.split(",")).map(String::trim).collect(Collectors.toSet());
        for (String origin : origins) {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().isEmpty()) {
                throw new IllegalArgumentException("Pilot CORS phải là danh sách origin HTTPS cụ thể, không có path/wildcard.");
            }
        }
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.isEmpty()) path = request.getRequestURI().substring(request.getContextPath().length());
        if ("POST".equals(request.getMethod()) && path.startsWith("/api/v1/auth/")) {
            if (!origins.contains(request.getHeader("Origin")) || !"1".equals(request.getHeader("X-LAMS-Client"))) {
                problems.write(request, response, 403, "Forbidden", "Nguồn yêu cầu xác thực không được phép.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
