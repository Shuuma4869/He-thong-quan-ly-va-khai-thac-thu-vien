package io.github.shuuma4869.lams.core.inventory.audit.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.audit.api.InventoryRequests;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventorySession;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence;
import io.github.shuuma4869.lams.core.inventory.audit.infrastructure.InventorySessionRepository;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class InventorySessionService {
    public record ScanResult(UUID id, UUID sessionId, UUID clientScanId, String barcode, UUID branchId,
        UUID shelfId, UUID scannedBy, Instant receivedAt, Instant clientScannedAt, long sessionVersion) {}
    private final JdbcTemplate jdbc;
    private final InventorySessionRepository repository;
    private final CirculationAccess access;
    private final CommandExecutor commands;
    private final Clock clock;
    public InventorySessionService(JdbcTemplate jdbc, InventorySessionRepository repository, CirculationAccess access,
            CommandExecutor commands, Clock clock) {
        this.jdbc=jdbc; this.repository=repository; this.access=access; this.commands=commands; this.clock=clock;
    }
    public InventorySession start(UUID actor, InventoryRequests.Start request) {
        if(request.branchId()==null) throw new AuthFailure(422,"Cần chọn chi nhánh kiểm kê.");
        return commands.execute(actor,request.requestId(),"INVENTORY_START",request,InventorySession.class,()->access.staff(actor),()->{
            var branch=jdbc.queryForList("SELECT status FROM branches WHERE id=? FOR SHARE",request.branchId());
            if(branch.isEmpty()) throw new AuthFailure(404,"Không tìm thấy chi nhánh.");
            if(!branch.getFirst().get("status").equals("ACTIVE")) throw new AuthFailure(409,"Chi nhánh không hoạt động.");
            if(request.shelfId()!=null) requireShelf(request.shelfId(),request.branchId());
            if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM inventory_sessions WHERE branch_id=? AND status='OPEN')",Boolean.class,request.branchId())))
                throw new AuthFailure(409,"Chi nhánh còn phiên đang quét; chốt hoặc hủy phiên trước khi mở phiên mới.");
            Instant cutoff=now(); var copies=repository.scope(request.branchId(),request.shelfId());
            if(copies.size()>5000) throw new AuthFailure(422,"Phạm vi vượt 5000 bản sách; hãy chọn một kệ nhỏ hơn.");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO inventory_sessions(id,branch_id,shelf_id,opened_by,opened_at,snapshot_count) VALUES (?,?,?,?,?,?)",
                id,request.branchId(),request.shelfId(),actor,Timestamp.from(cutoff),copies.size());
            jdbc.batchUpdate("INSERT INTO inventory_snapshots(session_id,copy_id,barcode,branch_id,shelf_id,status,copy_version) VALUES (?,?,?,?,?,?,?)",
                copies,copies.isEmpty()?1:copies.size(),(s,c)->{
                    s.setObject(1,id);s.setObject(2,c.id());s.setString(3,c.barcode());s.setObject(4,c.branchId());s.setObject(5,c.shelfId());s.setString(6,c.status());s.setLong(7,c.version());
                });
            return repository.find(id,false);
        });
    }
    public ScanResult scan(UUID actor,UUID id,InventoryRequests.Scan input) {
        if(input.barcode()==null || input.barcode().isBlank() || input.barcode().length()>100 || input.shelfId()==null)
            throw new AuthFailure(422,"Mã vạch hoặc kệ quét không hợp lệ.");
        var request=new InventoryRequests.Scan(input.clientScanId(),input.barcode().trim(),input.shelfId(),input.clientScannedAt());
        UUID receiptId=UUID.nameUUIDFromBytes((id+":"+request.clientScanId()).getBytes(StandardCharsets.UTF_8));
        return commands.execute(actor,receiptId,"INVENTORY_SCAN",Map.of("sessionId",id,"scan",request),ScanResult.class,()->access.staff(actor),()->{
            var session=repository.find(id,true); access.staff(actor);
            if(!session.status().equals("OPEN")) throw new AuthFailure(409,"Phiên đã chốt hoặc hủy; không nhận thêm scan.");
            if(session.scanCount()>=20000) throw new AuthFailure(422,"Phiên đã đạt giới hạn 20000 scan.");
            if(session.shelfId()!=null && !session.shelfId().equals(request.shelfId())) throw new AuthFailure(422,"Kệ quét nằm ngoài phạm vi phiên.");
            requireShelf(request.shelfId(),session.branchId());
            Instant received=now();
            if(request.clientScannedAt()!=null && (request.clientScannedAt().isBefore(session.openedAt().minusSeconds(300)) || request.clientScannedAt().isAfter(received.plusSeconds(300))))
                throw new AuthFailure(422,"Giờ trên thiết bị không phù hợp với thời gian mở phiên; kiểm tra lại đồng hồ.");
            UUID scanId=UUID.randomUUID();
            jdbc.update("INSERT INTO inventory_scans(id,session_id,client_scan_id,barcode,branch_id,shelf_id,scanned_by,received_at,client_scanned_at) VALUES (?,?,?,?,?,?,?,?,?)",
                scanId,id,request.clientScanId(),request.barcode(),session.branchId(),request.shelfId(),actor,Timestamp.from(received),request.clientScannedAt()==null?null:Timestamp.from(request.clientScannedAt()));
            jdbc.update("UPDATE inventory_sessions SET scan_count=scan_count+1,version=version+1 WHERE id=?",id);
            return new ScanResult(scanId,id,request.clientScanId(),request.barcode(),session.branchId(),request.shelfId(),actor,received,request.clientScannedAt(),session.version()+1);
        });
    }
    public InventorySession close(UUID actor,UUID id,InventoryRequests.Close request,boolean cancel) {
        if(request.version()==null || request.version()<0 || request.reason()!=null && request.reason().length()>500 || cancel && (request.reason()==null || request.reason().isBlank()))
            throw new AuthFailure(422,"Cần version hợp lệ và lý do khi hủy phiên.");
        return commands.execute(actor,request.requestId(),cancel?"INVENTORY_CANCEL":"INVENTORY_FINALIZE",Map.of("sessionId",id,"close",request),InventorySession.class,()->access.staff(actor),()->{
            var session=repository.find(id,true); access.staff(actor);
            if(!session.status().equals("OPEN") || session.version()!=request.version()) throw new AuthFailure(409,"Phiên đã thay đổi; tải lại trước khi chốt.");
            Instant time=now();
            if(!cancel) {
                var scans=jdbc.query("SELECT * FROM inventory_scans WHERE session_id=? ORDER BY received_at,id",(r,n)->new InventoryEvidence.Scan(
                    r.getObject("id",UUID.class),r.getString("barcode"),r.getObject("branch_id",UUID.class),r.getObject("shelf_id",UUID.class),r.getTimestamp("received_at").toInstant(),r.getObject("scanned_by",UUID.class)),id);
                var current=jdbc.query("""
                    SELECT c.id,c.barcode,s.branch_id,c.shelf_id,c.status,c.version FROM book_copies c JOIN shelves s ON s.id=c.shelf_id
                    WHERE c.id IN (SELECT copy_id FROM inventory_snapshots WHERE session_id=?)
                    OR c.barcode IN (SELECT barcode FROM inventory_scans WHERE session_id=?)
                    """,(r,n)->InventorySessionRepository.copy(r),id,id);
                var anomalies=new AnomalyDetector().detect(id,repository.snapshot(id),current,scans,true);
                jdbc.batchUpdate("INSERT INTO inventory_anomalies(id,session_id,copy_id,kind,evidence,detected_at) VALUES (?,?,?,?,?::jsonb,?)",
                    anomalies,anomalies.isEmpty()?1:500,(s,a)->{
                        s.setObject(1,a.id());s.setObject(2,id);s.setObject(3,a.copyId());s.setString(4,a.kind().name());s.setString(5,commands.encode(a));s.setTimestamp(6,Timestamp.from(time));
                    });
            }
            jdbc.update("UPDATE inventory_sessions SET status=?,version=version+1,closed_at=?,closed_by=?,close_reason=? WHERE id=?",
                cancel?"CANCELLED":"FINALIZED",Timestamp.from(time),actor,request.reason()==null?null:request.reason().trim(),id);
            return repository.find(id,false);
        });
    }
    private void requireShelf(UUID shelf,UUID branch) {
        var rows=jdbc.queryForList("SELECT branch_id FROM shelves WHERE id=? FOR SHARE",shelf);
        if(rows.isEmpty()) throw new AuthFailure(404,"Không tìm thấy kệ.");
        if(!rows.getFirst().get("branch_id").equals(branch)) throw new AuthFailure(422,"Kệ không thuộc chi nhánh kiểm kê.");
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MICROS); }
}
