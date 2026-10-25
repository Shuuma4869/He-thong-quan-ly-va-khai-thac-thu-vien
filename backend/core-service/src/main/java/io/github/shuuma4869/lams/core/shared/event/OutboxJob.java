package io.github.shuuma4869.lams.core.shared.event;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(prefix="lams.outbox", name={"enabled", "job-enabled"}, havingValue="true")
public class OutboxJob {
    private static final Logger log = LoggerFactory.getLogger(OutboxJob.class);
    private final OutboxPublisher publisher;
    private volatile boolean closing;
    public OutboxJob(OutboxPublisher publisher) { this.publisher = publisher; }
    @jakarta.annotation.PreDestroy
    void stop() { closing = true; }
    @Scheduled(scheduler="outboxScheduler", initialDelay=5000, fixedDelay=5000)
    public void sweep() {
        try {
            for (int i=0; i<20 && !closing; i++) if (publisher.publishOne() != OutboxPublisher.Result.SENT) return;
        } catch (RuntimeException e) {
            log.warn("Outbox chưa hoàn tất giao dịch; sẽ thử lại. Loại lỗi: {}", e.getClass().getSimpleName());
        }
    }
}
