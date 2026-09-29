package io.github.shuuma4869.lams.core.shared.error;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.shared.security.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrorHandler {
    @ExceptionHandler(AuthFailure.class)
    ResponseEntity<ProblemDetail> auth(AuthFailure error, HttpServletRequest request) {
        return problem(error.status(), error.getMessage(), request, List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException error, HttpServletRequest request) {
        List<Map<String, String>> fields = error.getBindingResult().getFieldErrors().stream()
                .map(field -> Map.of("field", field.getField(), "message",
                        field.getDefaultMessage() == null ? "Giá trị không hợp lệ." : field.getDefaultMessage()))
                .toList();
        return problem(422, "Dữ liệu gửi lên không hợp lệ.", request, fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> malformed(HttpMessageNotReadableException error, HttpServletRequest request) {
        return problem(400, "Nội dung yêu cầu không hợp lệ.", request, List.of());
    }

    private ResponseEntity<ProblemDetail> problem(int status, String detail, HttpServletRequest request,
                                                   List<Map<String, String>> fields) {
        var body = ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status), detail);
        body.setTitle(HttpStatus.valueOf(status).getReasonPhrase());
        body.setInstance(java.net.URI.create(request.getRequestURI()));
        body.setProperty("requestId", request.getAttribute(RequestIdFilter.ATTRIBUTE));
        if (!fields.isEmpty()) body.setProperty("errors", fields);
        return ResponseEntity.status(status).body(body);
    }
}
