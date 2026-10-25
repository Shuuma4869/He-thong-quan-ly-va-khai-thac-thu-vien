package io.github.shuuma4869.lams.core.inventory.audit.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventorySession;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryResolution;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Copy;
import io.github.shuuma4869.lams.core.inventory.audit.infrastructure.InventorySessionRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ,timeout=10)
public class InventoryQueryService {
    public record Pagination(int page,int size,long totalElements,long totalPages) {}
    public record Page<T>(List<T> items,Pagination page) {}
    public record ScanRow(UUID id,UUID clientScanId,String barcode,UUID branchId,UUID shelfId,UUID scannedBy,Instant receivedAt,Instant clientScannedAt) {}
    public record AnomalyRow(UUID id,String kind,UUID copyId,JsonNode evidence,Instant detectedAt,
            InventoryResolution resolution) {}
    private final JdbcTemplate jdbc;
    private final InventorySessionRepository sessions;
    private final CirculationAccess access;
    private final ObjectMapper json;
    public InventoryQueryService(JdbcTemplate jdbc,InventorySessionRepository sessions,CirculationAccess access,ObjectMapper json) {
        this.jdbc=jdbc;this.sessions=sessions;this.access=access;this.json=json;
    }
    public InventorySession get(UUID actor,UUID id) { access.staff(actor);return sessions.find(id,false); }
    public Page<InventorySession> list(UUID actor,UUID branch,String status,int page,int size) {
        access.staff(actor); validate(page,size);
        if(status!=null && !List.of("OPEN","FINALIZED","CANCELLED").contains(status)) throw new AuthFailure(422,"Trạng thái phiên không hợp lệ.");
        String filter=" WHERE (?::uuid IS NULL OR branch_id=?) AND (?::text IS NULL OR status=?)";
        long count=jdbc.queryForObject("SELECT count(*) FROM inventory_sessions"+filter,Long.class,branch,branch,status,status);
        var rows=jdbc.query("SELECT * FROM inventory_sessions"+filter+" ORDER BY opened_at DESC,id DESC LIMIT ? OFFSET ?",
            (r,n)->InventorySessionRepository.map(r),branch,branch,status,status,size,page*size);
        return result(rows,page,size,count);
    }
    public Page<Copy> snapshot(UUID actor,UUID id,int page,int size) {
        get(actor,id);validate(page,size);
        var rows=jdbc.query("SELECT copy_id AS id,barcode,branch_id,shelf_id,status,copy_version AS version FROM inventory_snapshots WHERE session_id=? ORDER BY copy_id LIMIT ? OFFSET ?",
            (r,n)->InventorySessionRepository.copy(r),id,size,page*size);
        return result(rows,page,size,count("inventory_snapshots",id));
    }
    public Page<ScanRow> scans(UUID actor,UUID id,int page,int size) {
        get(actor,id);validate(page,size);
        var rows=jdbc.query("SELECT * FROM inventory_scans WHERE session_id=? ORDER BY received_at,id LIMIT ? OFFSET ?",
            (r,n)->new ScanRow(r.getObject("id",UUID.class),r.getObject("client_scan_id",UUID.class),r.getString("barcode"),
                r.getObject("branch_id",UUID.class),r.getObject("shelf_id",UUID.class),r.getObject("scanned_by",UUID.class),
                r.getTimestamp("received_at").toInstant(),r.getTimestamp("client_scanned_at")==null?null:r.getTimestamp("client_scanned_at").toInstant()),id,size,page*size);
        return result(rows,page,size,count("inventory_scans",id));
    }
    public Page<AnomalyRow> anomalies(UUID actor,UUID id,int page,int size) {
        get(actor,id);validate(page,size);
        var rows=jdbc.query("""
            SELECT a.id,a.kind,a.copy_id,a.evidence,a.detected_at,
                r.id AS resolution_id,r.action,r.reason,r.copy_version_seen,r.copy_version_after,r.resolved_by,r.resolved_at
            FROM inventory_anomalies a LEFT JOIN inventory_resolutions r ON r.anomaly_id=a.id
            WHERE a.session_id=? ORDER BY a.kind,a.id LIMIT ? OFFSET ?
            """,(r,n)->{
                UUID resolutionId=r.getObject("resolution_id",UUID.class);
                InventoryResolution resolution=resolutionId==null?null:new InventoryResolution(resolutionId,
                    r.getObject("id",UUID.class),r.getString("action"),r.getString("reason"),
                    r.getObject("copy_version_seen",Long.class),r.getObject("copy_version_after",Long.class),
                    r.getObject("resolved_by",UUID.class),r.getTimestamp("resolved_at").toInstant());
                return new AnomalyRow(r.getObject("id",UUID.class),r.getString("kind"),r.getObject("copy_id",UUID.class),
                    read(r.getString("evidence")),r.getTimestamp("detected_at").toInstant(),resolution);
            },id,size,page*size);
        return result(rows,page,size,count("inventory_anomalies",id));
    }
    private long count(String table,UUID id) { return jdbc.queryForObject("SELECT count(*) FROM "+table+" WHERE session_id=?",Long.class,id); }
    private JsonNode read(String value) {
        try {return json.readTree(value);} catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException("Bằng chứng kiểm kê không đọc được.",e);}
    }
    private void validate(int page,int size) { if(page<0 || page>10000 || size<1 || size>100) throw new AuthFailure(422,"Trang phải từ 0 đến 10000, số dòng từ 1 đến 100."); }
    private <T> Page<T> result(List<T> rows,int page,int size,long count) {return new Page<>(rows,new Pagination(page,size,count,(count+size-1)/size));}
}
