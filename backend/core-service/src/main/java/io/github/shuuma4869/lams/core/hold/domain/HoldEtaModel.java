package io.github.shuuma4869.lams.core.hold.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Mô phỏng có điều kiện, không thay đổi hàng chờ hoặc quyền nhận sách. */
public final class HoldEtaModel {
    public record Candidate(UUID id, UUID editionId, Instant availableAt) {}
    public record Request(UUID id, UUID editionId, long pickupSeconds) {}
    public record Result(Instant estimatedAt, String reason) {}
    private HoldEtaModel() {}

    public static Result estimate(UUID target, List<Request> queue, List<Candidate> candidates,
                                  Duration loanDuration) {
        var slots = new ArrayList<>(candidates);
        var order = Comparator.comparing(Candidate::availableAt).thenComparing(c -> c.id().toString());
        for (Request request : queue) {
            Candidate next = slots.stream().filter(c -> request.editionId() == null || request.editionId().equals(c.editionId()))
                    .min(order).orElse(null);
            if (next == null) {
                if (request.id().equals(target)) return new Result(null, "NO_COMPATIBLE_COPY");
                continue;
            }
            if (request.id().equals(target)) return new Result(next.availableAt(), "CONDITIONAL");
            // Giả định người trước nhận vào cuối hạn và trả đúng hạn, không gia hạn.
            slots.remove(next);
            slots.add(new Candidate(next.id(), next.editionId(), next.availableAt().plusSeconds(request.pickupSeconds()).plus(loanDuration)));
        }
        return new Result(null, "QUEUE_CHANGED");
    }
}
