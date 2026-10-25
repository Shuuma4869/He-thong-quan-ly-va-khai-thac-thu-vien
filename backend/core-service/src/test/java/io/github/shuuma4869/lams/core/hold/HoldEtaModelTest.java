package io.github.shuuma4869.lams.core.hold;

import static org.assertj.core.api.Assertions.assertThat;
import io.github.shuuma4869.lams.core.hold.domain.HoldEtaModel;
import io.github.shuuma4869.lams.core.hold.domain.HoldEtaModel.Candidate;
import io.github.shuuma4869.lams.core.hold.domain.HoldEtaModel.Request;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class HoldEtaModelTest {
    private final UUID first = UUID.randomUUID(), target = UUID.randomUUID(), edition = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-10-25T00:00:00Z");
    private final Duration duration = Duration.ofDays(14);
    private Request request(UUID id, UUID scope) { return new Request(id, scope, 172800); }
    @Test void noCopyAndMissingQueueDoNotInventDates() {
        assertThat(HoldEtaModel.estimate(target, List.of(request(target, edition)), List.of(), duration).reason()).isEqualTo("NO_COMPATIBLE_COPY");
        assertThat(HoldEtaModel.estimate(target, List.of(), List.of(), duration).reason()).isEqualTo("QUEUE_CHANGED");
    }
    @Test void earlierCompatibleHoldConsumesOnePickupAndLoanCycle() {
        var copies = List.of(new Candidate(UUID.randomUUID(), edition, now));
        assertThat(HoldEtaModel.estimate(target, List.of(request(first, edition), request(target, edition)), copies, duration).estimatedAt())
                .isEqualTo(now.plus(Duration.ofDays(16)));
        assertThat(HoldEtaModel.estimate(target, List.of(request(target, edition)), copies, duration).estimatedAt()).isEqualTo(now);
    }
    @Test void differentEditionDoesNotConsumeOnlyCompatibleCopy() {
        var copies = List.of(new Candidate(UUID.randomUUID(), edition, now));
        assertThat(HoldEtaModel.estimate(target, List.of(request(first, UUID.randomUUID()), request(target, edition)), copies, duration).estimatedAt()).isEqualTo(now);
    }
    @Test void flexibleHoldConsumesEarliestCopyAndTargetKeepsEdition() {
        var other = UUID.randomUUID();
        var copies = List.of(new Candidate(UUID.randomUUID(), other, now), new Candidate(UUID.randomUUID(), edition, now.plusSeconds(60)));
        assertThat(HoldEtaModel.estimate(target, List.of(request(first, null), request(target, edition)), copies, duration).estimatedAt()).isEqualTo(now.plusSeconds(60));
    }
    @Test void tiedAvailabilityUsesStableCopyIdWithoutMutatingInputs() {
        var a = UUID.fromString("00000000-0000-4000-8000-000000000001");
        var b = UUID.fromString("00000000-0000-4000-8000-000000000002");
        var copies = List.of(new Candidate(b, UUID.randomUUID(), now), new Candidate(a, edition, now));
        assertThat(HoldEtaModel.estimate(target, List.of(request(first, null), request(target, edition)), copies, duration).estimatedAt()).isEqualTo(now.plus(Duration.ofDays(16)));
        assertThat(copies).extracting(Candidate::availableAt).containsOnly(now);
    }
}
