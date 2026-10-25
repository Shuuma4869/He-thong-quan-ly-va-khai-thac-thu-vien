package io.github.shuuma4869.lams.core.inventory.audit.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.audit.api.InventoryResolutionRequest;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryResolution;
import io.github.shuuma4869.lams.core.inventory.audit.infrastructure.InventorySessionRepository;
import io.github.shuuma4869.lams.core.inventory.copy.application.BookCopyService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class InventoryResolutionService {
    private record Fingerprint(UUID sessionId, UUID anomalyId, InventoryResolutionRequest request) {}
    private record Anomaly(UUID copyId, String kind, String evidence) {}
    private final JdbcTemplate jdbc;
    private final InventorySessionRepository sessions;
    private final BookCopyService copies;
    private final CirculationAccess access;
    private final CommandExecutor commands;
    private final ObjectMapper json;
    private final Clock clock;

    public InventoryResolutionService(JdbcTemplate jdbc, InventorySessionRepository sessions, BookCopyService copies,
            CirculationAccess access, CommandExecutor commands, ObjectMapper json, Clock clock) {
        this.jdbc=jdbc; this.sessions=sessions; this.copies=copies; this.access=access;
        this.commands=commands; this.json=json; this.clock=clock;
    }

    public InventoryResolution resolve(UUID actor, UUID sessionId, UUID anomalyId, InventoryResolutionRequest request) {
        if (request == null || request.action() == null || request.reason() == null
                || request.reason().isBlank() || request.reason().length() > 500
                || request.expectedCopyVersion() != null && request.expectedCopyVersion() < 0) {
            throw new AuthFailure(422, "Cần hành động, lý do và version bản sách hợp lệ.");
        }
        return commands.execute(actor, request.requestId(), "INVENTORY_RESOLVE",
            new Fingerprint(sessionId, anomalyId, request), InventoryResolution.class,
            () -> access.staff(actor), () -> {
                if (!sessions.find(sessionId, false).status().equals("FINALIZED"))
                    throw new AuthFailure(409, "Chỉ rà soát bất thường của phiên đã chốt.");
                var rows=jdbc.query("""
                    SELECT copy_id,kind,evidence::text FROM inventory_anomalies
                    WHERE id=? AND session_id=? FOR UPDATE
                    """, (r,n)->new Anomaly(r.getObject("copy_id",UUID.class),r.getString("kind"),r.getString("evidence")),
                    anomalyId,sessionId);
                if (rows.isEmpty()) throw new AuthFailure(404, "Không tìm thấy bất thường trong phiên.");
                if (Boolean.TRUE.equals(jdbc.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM inventory_resolutions WHERE anomaly_id=?)",Boolean.class,anomalyId)))
                    throw new AuthFailure(409, "Bất thường đã được rà soát; tải lại phiên.");
                var anomaly=rows.getFirst();
                InventoryEvidence.Anomaly evidence=read(anomaly.evidence());
                if (!evidence.id().equals(anomalyId) || !evidence.sessionId().equals(sessionId)
                        || !evidence.kind().name().equals(anomaly.kind())
                        || anomaly.copyId() != null && !anomaly.copyId().equals(evidence.copyId()))
                    throw new IllegalStateException("Bằng chứng kiểm kê không khớp bản ghi.");
                Long seen=request.expectedCopyVersion();
                Long after=null;
                if (anomaly.copyId() == null) {
                    if (seen != null) throw new AuthFailure(422, "Mã vạch chưa nhận diện được bản sách; không gửi version Copy.");
                } else {
                    var live=jdbc.query("SELECT version FROM book_copies WHERE id=?",
                        (r,n)->r.getLong(1),anomaly.copyId());
                    if (live.isEmpty()) {
                        if (seen != null) throw new AuthFailure(409, "Bản sách không còn tồn tại; tải lại và ghi nhận rà soát.");
                    } else if (seen == null || !seen.equals(live.getFirst())) {
                        throw new AuthFailure(409, "Bản sách đã thay đổi; tải bản hiện tại trước khi xác nhận.");
                    }
                }
                if (request.action() == InventoryResolutionRequest.Action.MOVE_TO_SCANNED_SHELF) {
                    if (!anomaly.kind().equals("WRONG_SHELF") && !anomaly.kind().equals("WRONG_BRANCH"))
                        throw new AuthFailure(422, "Loại bất thường này không cho phép chuyển kệ.");
                    if (evidence.scan() == null || evidence.current() == null || anomaly.copyId() == null || seen == null
                            || evidence.current().version() != seen || !evidence.scan().barcode().equals(evidence.current().barcode()))
                        throw new AuthFailure(409, "Bằng chứng vị trí đã cũ hoặc không đủ để chuyển kệ.");
                    var destination=jdbc.query("""
                        SELECT s.branch_id,b.status FROM shelves s JOIN branches b ON b.id=s.branch_id
                        WHERE s.id=? FOR UPDATE OF s,b
                        """,(r,n)->new Object[]{r.getObject(1,UUID.class),r.getString(2)},evidence.scan().shelfId());
                    if (destination.isEmpty() || !destination.getFirst()[0].equals(evidence.scan().branchId())
                            || !destination.getFirst()[1].equals("ACTIVE"))
                        throw new AuthFailure(409, "Kệ hoặc chi nhánh nơi quét đã thay đổi; không chuyển tự động.");
                    var current=copies.get(actor,anomaly.copyId());
                    if (!current.barcode().equals(evidence.scan().barcode()) || current.shelfId().equals(evidence.scan().shelfId()))
                        throw new AuthFailure(409, "Bản sách đã đổi mã hoặc đã nằm ở kệ quét; tải lại trước khi xử lý.");
                    after=copies.update(actor,current.id(),current.editionId(),current.barcode(),
                        evidence.scan().shelfId(),seen).version();
                }
                Instant at=clock.instant().truncatedTo(ChronoUnit.MICROS);
                UUID id=UUID.randomUUID();
                String reason=request.reason().trim();
                jdbc.update("""
                    INSERT INTO inventory_resolutions(id,anomaly_id,action,reason,copy_version_seen,copy_version_after,resolved_by,resolved_at)
                    VALUES (?,?,?,?,?,?,?,?)
                    """,id,anomalyId,request.action().name(),reason,seen,after,actor,Timestamp.from(at));
                return new InventoryResolution(id,anomalyId,request.action().name(),reason,seen,after,actor,at);
            });
    }

    private InventoryEvidence.Anomaly read(String value) {
        try { return json.readValue(value,InventoryEvidence.Anomaly.class); }
        catch (JsonProcessingException error) { throw new IllegalStateException("Bằng chứng kiểm kê không đọc được.",error); }
    }
}
