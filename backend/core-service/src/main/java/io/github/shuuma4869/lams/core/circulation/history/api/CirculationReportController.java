package io.github.shuuma4869.lams.core.circulation.history.api;

import io.github.shuuma4869.lams.core.circulation.history.application.CirculationReportService;
import io.github.shuuma4869.lams.core.circulation.history.application.LoanCsvExporter;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
@PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
public class CirculationReportController {
    private final CirculationReportService service;
    public CirculationReportController(CirculationReportService service) {this.service=service;}

    @GetMapping("/circulation")
    public CirculationReportResponse report(JwtAuthenticationToken token,@RequestParam(required=false) UUID branchId,
            @RequestParam String from,@RequestParam String to,@RequestParam(required=false) String timezone) {
        return service.report(UUID.fromString(token.getToken().getSubject()),branchId,from,to,timezone);
    }
    @GetMapping(value="/circulation.csv",produces="text/csv")
    public ResponseEntity<byte[]> csv(JwtAuthenticationToken token,@RequestParam(required=false) UUID branchId,
            @RequestParam String from,@RequestParam String to,@RequestParam(required=false) String timezone) {
        var report=report(token,branchId,from,to,timezone);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=circulation.csv")
                .header(HttpHeaders.CACHE_CONTROL,"no-store").body(LoanCsvExporter.export(report));
    }
}
