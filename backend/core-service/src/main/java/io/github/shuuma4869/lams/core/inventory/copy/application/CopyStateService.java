package io.github.shuuma4869.lams.core.inventory.copy.application;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.circulation.shared.CommandExecutor;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.domain.BookCopy;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.BookCopyRepository;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.CopyLockRepository.LockedCopy;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CopyStateService {
    private static final Map<String, Set<String>> MANUAL = Map.of(
            "IN_PROCESS", Set.of("AVAILABLE", "WITHDRAWN"),
            "AVAILABLE", Set.of("LOST", "DAMAGED"),
            "DAMAGED", Set.of("IN_PROCESS", "WITHDRAWN"), "LOST", Set.of("IN_PROCESS"));
    private final JdbcTemplate jdbc;
    private final CopyLockRepository locks;
    private final BookCopyRepository copies;
    private final CirculationAccess access;
    private final CommandExecutor commands;

    public CopyStateService(JdbcTemplate jdbc, CopyLockRepository locks, BookCopyRepository copies,
                            CirculationAccess access, CommandExecutor commands) {
        this.jdbc = jdbc; this.locks = locks; this.copies = copies; this.access = access; this.commands = commands;
    }

    public BookCopy change(UUID actor, UUID copyId, UUID requestId, long version, String target, String reason) {
        if (version < 0 || target == null || reason == null || reason.isBlank() || reason.length() > 500) {
            throw new AuthFailure(422, "Trạng thái, version hoặc lý do không hợp lệ.");
        }
        return commands.execute(actor, requestId, "COPY_STATE", Map.of("copyId", copyId, "version", version,
                "target", target, "reason", reason), BookCopy.class, () -> access.staff(actor), () -> {
            var copy = locks.lock(copyId);
            access.staff(actor);
            if (copy.version() != version) throw new AuthFailure(409, "Bản sách đã thay đổi; hãy tải lại.");
            if (!MANUAL.getOrDefault(copy.status(), Set.of()).contains(target)) {
                throw new AuthFailure(409, "Không được chuyển trạng thái này bằng thao tác bảo trì.");
            }
            if (target.equals("AVAILABLE") && !copy.branchStatus().equals("ACTIVE")) {
                throw new AuthFailure(409, "Chi nhánh không hoạt động.");
            }
            if (Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM loans WHERE copy_id=? AND returned_at IS NULL)", Boolean.class, copyId))) {
                throw new AuthFailure(409, "Bản sách vẫn còn lượt mượn chưa đóng.");
            }
            transition(copy, target, actor, reason.trim(), Instant.now());
            return copies.find(copyId).orElseThrow();
        });
    }

    // Chỉ command nội bộ gọi sau khi khóa Copy và kiểm Loan/Hold trong cùng transaction.
    @Transactional(propagation = Propagation.MANDATORY)
    public void transition(LockedCopy copy, String target, UUID actor, String reason, Instant now) {
        boolean circulation = (copy.status().equals("AVAILABLE") && Set.of("ON_LOAN", "ON_HOLD").contains(target))
                || (copy.status().equals("ON_LOAN") && Set.of("AVAILABLE", "ON_HOLD", "LOST", "DAMAGED").contains(target))
                || (copy.status().equals("ON_HOLD") && Set.of("AVAILABLE", "ON_LOAN").contains(target));
        if (!circulation && !MANUAL.getOrDefault(copy.status(), Set.of()).contains(target)) {
            throw new AuthFailure(409, "Chuyển trạng thái bản sách không hợp lệ.");
        }
        if (jdbc.update("UPDATE book_copies SET status=?,version=version+1 WHERE id=? AND status=? AND version=?",
                target, copy.id(), copy.status(), copy.version()) != 1) {
            throw new AuthFailure(409, "Bản sách đã thay đổi; hãy tải lại.");
        }
        jdbc.update("""
                INSERT INTO copy_state_changes(id,copy_id,from_status,to_status,copy_version,actor_id,actor_kind,reason,occurred_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                """, UUID.randomUUID(), copy.id(), copy.status(), target, copy.version() + 1, actor,
                actor == null ? "SYSTEM" : "HUMAN", reason, Timestamp.from(now));
    }
}
