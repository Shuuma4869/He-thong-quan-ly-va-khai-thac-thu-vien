package io.github.shuuma4869.lams.core.catalog.media;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MediaRepository {
    private final JdbcTemplate jdbc;
    public MediaRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    static String column(String kind) { return kind.equals("editions")?"edition_id":"author_id"; }
    public Optional<MediaReference> get(String kind, UUID subject) {
        return jdbc.query("SELECT * FROM catalog_media_references WHERE "+column(kind)+"=?",(r,n)->map(r),subject).stream().findFirst();
    }
    public void create(String kind,UUID subject,UUID actor,MediaRequest request,MediaInspector.Inspection image) {
        jdbc.update("INSERT INTO catalog_media_references(id,"+column(kind)+",source,source_id,source_url,image_url,license,license_url,attribution,evidence,mime,byte_size,approved_by,approved_at) "
                +"VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,now())",UUID.randomUUID(),subject,request.source(),request.sourceId(),request.sourceUrl(),request.imageUrl(),
                request.license(),request.licenseUrl(),request.attribution(),request.evidence(),image.mime(),image.byteSize(),actor);
    }
    public boolean update(String kind,UUID subject,UUID actor,MediaRequest request,MediaInspector.Inspection image) {
        return jdbc.update("UPDATE catalog_media_references SET source=?,source_id=?,source_url=?,image_url=?,license=?,license_url=?,attribution=?,evidence=?,mime=?,byte_size=?,approved_by=?,approved_at=now(),version=nextval('catalog_media_revision_seq') "
                +"WHERE "+column(kind)+"=? AND version=?",request.source(),request.sourceId(),request.sourceUrl(),request.imageUrl(),request.license(),request.licenseUrl(),request.attribution(),request.evidence(),image.mime(),image.byteSize(),actor,subject,request.expectedVersion())==1;
    }
    public boolean delete(String kind,UUID subject,long version) {
        return jdbc.update("DELETE FROM catalog_media_references WHERE "+column(kind)+"=? AND version=?",subject,version)==1;
    }
    private static MediaReference map(ResultSet r) throws SQLException {
        return new MediaReference(r.getObject("id",UUID.class),r.getString("source"),r.getString("source_id"),r.getString("source_url"),r.getString("image_url"),
                r.getString("license"),r.getString("license_url"),r.getString("attribution"),r.getString("evidence"),r.getString("mime"),r.getInt("byte_size"),r.getObject("approved_by",UUID.class),r.getTimestamp("approved_at").toInstant(),r.getLong("version"));
    }
}
