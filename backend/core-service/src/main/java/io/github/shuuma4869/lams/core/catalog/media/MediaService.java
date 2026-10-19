package io.github.shuuma4869.lams.core.catalog.media;

import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class MediaService {
    private final MediaRepository media;
    private final MediaInspector inspector;
    private final AuthService identity;
    private final JdbcTemplate jdbc;
    public MediaService(MediaRepository media,MediaInspector inspector,AuthService identity,JdbcTemplate jdbc) {
        this.media=media;this.inspector=inspector;this.identity=identity;this.jdbc=jdbc;
    }
    public MediaReference get(UUID actor,String kind,UUID subject) {
        CatalogAccess.requireReader(identity,actor); requireSubject(kind,subject); return media.get(kind,subject).orElse(null);
    }
    public MediaReference approve(UUID actor,String kind,UUID subject,MediaRequest request) {
        requireStaff(actor); requireSubject(kind,subject);
        if (!request.confirmed()) throw new AuthFailure(422,"Cần xác nhận quyền sử dụng và định danh ảnh.");
        var image=inspector.inspect(request);
        // Network inspection is outside a DB transaction; recheck access before the atomic write.
        requireStaff(actor); requireSubject(kind,subject);
        try {
            if (request.expectedVersion()==null) media.create(kind,subject,actor,request,image);
            else if (!media.update(kind,subject,actor,request,image)) throw conflict();
        } catch (DataIntegrityViolationException error) { throw conflict(); }
        return media.get(kind,subject).orElseThrow(MediaService::conflict);
    }
    public void remove(UUID actor,String kind,UUID subject,Long version) {
        requireStaff(actor); requireSubject(kind,subject);
        if (version==null || version<0) throw new AuthFailure(422,"Cần version hiện tại để gỡ ảnh.");
        if (!media.delete(kind,subject,version)) throw conflict();
    }
    private void requireStaff(UUID actor) {
        if (identity.currentUser(actor).roles().stream().noneMatch(role->role==RoleCode.LIBRARIAN || role==RoleCode.ADMIN)) throw new AuthFailure(403,"Chỉ nhân viên được duyệt ảnh.");
    }
    private void requireSubject(String kind,UUID subject) {
        if (!kind.equals("editions") && !kind.equals("authors")) throw new AuthFailure(404,"Loại đối tượng media không tồn tại.");
        if (jdbc.queryForObject("SELECT count(*) FROM "+kind+" WHERE id=?",Integer.class,subject)==0) throw new AuthFailure(404,"Không tìm thấy đối tượng media.");
    }
    private static AuthFailure conflict() { return new AuthFailure(409,"Ảnh đã thay đổi hoặc đối tượng không còn tồn tại. Hãy tải lại trước khi duyệt."); }
}
