package io.github.shuuma4869.lams.core.hold;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import io.github.shuuma4869.lams.core.hold.application.HoldExpiryJob;
import io.github.shuuma4869.lams.core.hold.application.HoldService;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class HoldExpiryJobTest {
    @Test void fullBatchAdvancesCursorAndAnEmptyPageStartsAnotherCycle() {
        var jdbc=mock(JdbcTemplate.class); var service=mock(HoldService.class);
        var batch=IntStream.rangeClosed(1,100).mapToObj(n->new UUID(0,n)).toList();
        when(jdbc.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),nullable(UUID.class),nullable(UUID.class)))
                .thenReturn(batch,List.of(),List.of());
        var job=new HoldExpiryJob(jdbc,service); job.sweep(); job.sweep(); job.sweep();
        verify(service,times(100)).reconcileBook(any());
        var order=inOrder(jdbc);
        order.verify(jdbc).query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),isNull(),isNull());
        order.verify(jdbc).query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),eq(batch.getLast()),eq(batch.getLast()));
        order.verify(jdbc).query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),isNull(),isNull());
    }

    @Test void failedBookDoesNotStopOthersAndIsRetriedInNextCycle() {
        var jdbc=mock(JdbcTemplate.class); var service=mock(HoldService.class);
        UUID a=new UUID(0,1),b=new UUID(0,2);
        when(jdbc.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),nullable(UUID.class),nullable(UUID.class)))
                .thenReturn(List.of(a,b));
        doThrow(new IllegalStateException("test failure")).doNothing().when(service).reconcileBook(a);
        var job=new HoldExpiryJob(jdbc,service); job.sweep(); job.sweep();
        verify(service,times(2)).reconcileBook(a); verify(service,times(2)).reconcileBook(b);
        verify(jdbc,times(2)).query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<UUID>>any(),isNull(),isNull());
    }
}
