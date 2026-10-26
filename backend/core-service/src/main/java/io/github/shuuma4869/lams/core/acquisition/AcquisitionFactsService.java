package io.github.shuuma4869.lams.core.acquisition;

import io.github.shuuma4869.lams.core.circulation.shared.CirculationAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AcquisitionFactsService {
    private static final Pattern UTC = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$");
    private static final String SOURCE_VERSION = "acquisition-source-v1";
    private static final String SOURCE_REVISION = "core-acquisition-read-v1";

    public record Window(String from, String to, String asOf) {}
    public record CountSignal(Long count, String basis, String source, String unavailableReason) {}
    public record Snapshot(String contractVersion, String sourceRevision, UUID bookId, UUID branchId,
            Window window, long copiesOwned, long copiesAvailable, CountSignal waitingHolds,
            CountSignal loansStarted, CountSignal favoritesAdded) {}

    private final AcquisitionFactsRepository facts;
    private final CirculationAccess access;
    private final Clock clock;

    public AcquisitionFactsService(AcquisitionFactsRepository facts, CirculationAccess access, Clock clock) {
        this.facts = facts; this.access = access; this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, timeout = 15)
    public Snapshot load(UUID actor, UUID bookId, UUID branchId, String fromValue, String toValue) {
        access.staff(actor);
        if (bookId == null || branchId == null) throw invalid("Cần chọn sách và chi nhánh.");
        Instant from = utc(fromValue, "from");
        Instant to = utc(toValue, "to");
        Instant asOf = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        if (!to.isAfter(from) || to.isAfter(asOf) || to.toEpochMilli() - from.toEpochMilli() > 366L * 86_400_000L)
            throw invalid("Khoảng thời gian phải kết thúc trong quá khứ và không vượt 366 ngày.");
        if (!facts.bookExists(bookId)) throw new AuthFailure(404, "Không tìm thấy sách.");
        if (!facts.branchExists(branchId)) throw new AuthFailure(404, "Không tìm thấy chi nhánh.");

        var copies = facts.copies(bookId, branchId);
        long holds = facts.waitingHolds(bookId, branchId);
        long loans = facts.loansStarted(bookId, branchId, from, to);
        return new Snapshot(SOURCE_VERSION, SOURCE_REVISION, bookId, branchId,
                new Window(fromValue, toValue, asOf.toString()), copies.owned(), copies.available(),
                new CountSignal(holds, "CURRENT_STATE", "holds.status=WAITING", null),
                new CountSignal(loans, "WINDOWED_ROWS", "loans.borrowed_at", null),
                new CountSignal(null, null, null,
                        "Favorites hiện chỉ lưu mục đang có, không giữ đủ lịch sử lượt thêm đã bị bỏ."));
    }

    private static Instant utc(String value, String field) {
        if (value == null || !UTC.matcher(value).matches()) throw invalid(field + " phải là thời điểm UTC.");
        try {
            Instant parsed = Instant.parse(value);
            if (!parsed.toString().substring(0, 19).equals(value.substring(0, 19)))
                throw invalid(field + " không hợp lệ.");
            return parsed;
        } catch (java.time.DateTimeException error) {
            throw invalid(field + " không hợp lệ.");
        }
    }

    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }
}
