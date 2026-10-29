package io.github.shuuma4869.lams.core.reports.holdactivity;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
@PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
public class HoldActivityReportController {
    private final HoldActivityReportService service;

    public HoldActivityReportController(HoldActivityReportService service) {
        this.service = service;
    }

    @GetMapping("/hold-activity")
    public HoldActivityReport report(JwtAuthenticationToken token,
            @RequestParam OffsetDateTime from, @RequestParam OffsetDateTime to,
            @RequestParam(required = false) UUID branchId, @RequestParam(required = false) UUID bookId) {
        return service.report(actor(token), from, to, branchId, bookId);
    }

    @GetMapping(value = "/hold-activity.csv", produces = "text/csv")
    public ResponseEntity<byte[]> csv(JwtAuthenticationToken token,
            @RequestParam OffsetDateTime from, @RequestParam OffsetDateTime to,
            @RequestParam(required = false) UUID branchId, @RequestParam(required = false) UUID bookId) {
        var report = service.report(actor(token), from, to, branchId, bookId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=hold-activity.csv")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(HoldActivityCsvExporter.export(report));
    }

    private static UUID actor(JwtAuthenticationToken token) {
        return UUID.fromString(token.getToken().getSubject());
    }
}
