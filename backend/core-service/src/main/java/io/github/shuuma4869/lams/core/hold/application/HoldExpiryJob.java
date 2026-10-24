package io.github.shuuma4869.lams.core.hold.application;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(name="lams.circulation.hold-job-enabled",havingValue="true",matchIfMissing=true)
public class HoldExpiryJob {
    private static final Logger log=LoggerFactory.getLogger(HoldExpiryJob.class);
    private final JdbcTemplate jdbc;
    private final HoldService service;
    private UUID after;
    public HoldExpiryJob(JdbcTemplate jdbc,HoldService service) {this.jdbc=jdbc;this.service=service;}

    @Scheduled(initialDelayString="${lams.circulation.hold-job-delay-ms:30000}",fixedDelayString="${lams.circulation.hold-job-delay-ms:30000}")
    public void sweep() {
        var books=jdbc.query("""
                SELECT DISTINCT book_id FROM holds WHERE status IN ('WAITING','READY')
                AND (?::uuid IS NULL OR book_id>?) ORDER BY book_id LIMIT 100
                """,(r,n)->r.getObject(1,UUID.class),after,after);
        if(books.isEmpty()){after=null;return;}
        for(UUID book:books) {
            try {service.reconcileBook(book);}
            catch(RuntimeException e) {log.warn("Chưa xử lý được hàng đợi giữ chỗ; sẽ thử lại ở vòng sau. Loại lỗi: {}",e.getClass().getSimpleName());}
            after=book;
        }
        if(books.size()<100) after=null;
    }
}
