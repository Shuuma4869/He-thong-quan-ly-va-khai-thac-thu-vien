package io.github.shuuma4869.lams.core.shared.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import org.springframework.stereotype.Component;

@Component
public class SecurityProblemWriter {
    private final ObjectMapper mapper;

    public SecurityProblemWriter(ObjectMapper mapper) { this.mapper = mapper; }

    public void write(HttpServletRequest request, HttpServletResponse response, int status, String title, String detail)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json;charset=UTF-8");
        var body = new LinkedHashMap<String, Object>();
        body.put("type", "about:blank");
        body.put("title", title);
        body.put("status", status);
        body.put("detail", detail);
        body.put("instance", request.getRequestURI());
        body.put("requestId", request.getAttribute(RequestIdFilter.ATTRIBUTE));
        mapper.writeValue(response.getWriter(), body);
    }
}
