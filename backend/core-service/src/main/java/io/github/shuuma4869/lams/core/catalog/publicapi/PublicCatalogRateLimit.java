package io.github.shuuma4869.lams.core.catalog.publicapi;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class PublicCatalogRateLimit extends OncePerRequestFilter {
    private static final long WINDOW = 60_000_000_000L;
    private static final int LIMIT = 300;
    private static final int MAX_PEERS = 4096;
    private record Window(long started, AtomicInteger count) {}
    private final ConcurrentHashMap<String, Window> peers = new ConcurrentHashMap<>();

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getMethod().equals("GET") || !request.getRequestURI().startsWith("/api/v1/public/catalog/");
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                               FilterChain chain) throws ServletException, IOException {
        long now = System.nanoTime();
        if (peers.size() >= MAX_PEERS) {
            peers.entrySet().removeIf(entry -> now - entry.getValue().started() >= WINDOW);
        }
        String peer = request.getRemoteAddr();
        if (!peers.containsKey(peer) && peers.size() >= MAX_PEERS) { reject(response, 60); return; }
        Window window = peers.compute(peer, (key, old) ->
                old == null || now - old.started() >= WINDOW ? new Window(now, new AtomicInteger(1)) : increment(old));
        if (window.count().get() > LIMIT) {
            reject(response, Math.max(1, (int) ((WINDOW - (now - window.started())) / 1_000_000_000L))); return;
        }
        chain.doFilter(request, response);
    }

    private static Window increment(Window window) { window.count().incrementAndGet(); return window; }
    private static void reject(HttpServletResponse response, int seconds) throws IOException {
        response.setStatus(429);
        response.setHeader("Retry-After", Integer.toString(seconds));
        response.setContentType("application/problem+json;charset=UTF-8");
        response.getWriter().write("{\"title\":\"Too Many Requests\",\"detail\":\"Quá nhiều yêu cầu tra cứu. Vui lòng thử lại sau.\"}");
    }
}
