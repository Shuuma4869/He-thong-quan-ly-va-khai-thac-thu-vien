package io.github.shuuma4869.lams.core.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.shuuma4869.lams.core.inventory.audit.application.AnomalyDetector;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AnomalyDetectorTest {
    private final AnomalyDetector detector = new AnomalyDetector();
    private final UUID session = UUID.randomUUID(), branch = UUID.randomUUID(), shelf = UUID.randomUUID(), actor = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-10-24T00:00:00Z");
    private Copy copy(String status) { return new Copy(UUID.randomUUID(), UUID.randomUUID().toString(), branch, shelf, status, 1); }
    private Scan scan(Copy copy) { return new Scan(UUID.randomUUID(), copy.barcode(), branch, shelf, now, actor); }

    @Test void matchingScanAndReplayHaveNoAnomaly() {
        var copy = copy("AVAILABLE"); var scan = scan(copy);
        assertThat(detector.detect(session, List.of(copy), List.of(copy), List.of(scan, scan), true)).isEmpty();
    }

    @Test void sameIdWithDifferentPayloadIsRejectedNotSilentlyDiscarded() {
        var copy = copy("AVAILABLE"); var scan = scan(copy);
        var changed = new Scan(scan.id(), "khác", branch, shelf, now, actor);
        assertThatThrownBy(() -> detector.detect(session, List.of(copy), List.of(copy), List.of(scan, changed), false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void wrongShelfAndWrongBranchAreDistinguishedWithSnapshotEvidence() {
        var copy = copy("AVAILABLE"); var wrongShelf = new Scan(UUID.randomUUID(), copy.barcode(), branch, UUID.randomUUID(), now, actor);
        var wrongBranch = new Scan(UUID.randomUUID(), copy.barcode(), UUID.randomUUID(), UUID.randomUUID(), now, actor);
        var a = detector.detect(session, List.of(copy), List.of(copy), List.of(wrongShelf), false);
        assertThat(a).extracting(Anomaly::kind).containsExactly(Kind.WRONG_SHELF);
        assertThat(a.getFirst().snapshot()).isEqualTo(copy);
        assertThat(detector.detect(session, List.of(copy), List.of(copy), List.of(wrongBranch), false))
                .extracting(Anomaly::kind).containsExactly(Kind.WRONG_BRANCH);
    }

    @Test void concurrentLoanIsEvidenceNotAnAutomaticStatusCorrection() {
        var before = copy("AVAILABLE");
        var current = new Copy(before.id(), before.barcode(), branch, shelf, "ON_LOAN", 2);
        var result = detector.detect(session, List.of(before), List.of(current), List.of(scan(current)), true);
        assertThat(result).extracting(Anomaly::kind).containsExactly(Kind.STATUS_MISMATCH);
        assertThat(result.getFirst().snapshot().version()).isEqualTo(1);
        assertThat(result.getFirst().current().version()).isEqualTo(2);
        assertThat(current.status()).isEqualTo("ON_LOAN");
    }

    @Test void missingIsOnlyReportedAfterFinalizeAndRetainsChangedCurrentState() {
        var before = copy("AVAILABLE"); var onLoan = copy("ON_LOAN");
        var current = new Copy(before.id(), before.barcode(), branch, shelf, "ON_LOAN", 2);
        assertThat(detector.detect(session, List.of(before, onLoan), List.of(current, onLoan), List.of(), false)).isEmpty();
        var result = detector.detect(session, List.of(before, onLoan), List.of(current, onLoan), List.of(), true);
        assertThat(result).extracting(Anomaly::kind).containsExactly(Kind.EXPECTED_BUT_MISSING);
        assertThat(result.getFirst().current()).isEqualTo(current);
    }

    @Test void unknownBarcodeDoesNotPretendSnapshotCopyWasSeen() {
        var before = copy("AVAILABLE"); var unknown = new Scan(UUID.randomUUID(), "unknown", branch, shelf, now, actor);
        assertThat(detector.detect(session, List.of(before), List.of(before), List.of(unknown), true))
                .extracting(Anomaly::kind).containsExactly(Kind.UNKNOWN_BARCODE, Kind.EXPECTED_BUT_MISSING);
    }

    @Test void repeatedPhysicalScanHasStableEvidenceAndIdentityRegardlessOfInputOrder() {
        var copy = copy("AVAILABLE");
        var a = new Scan(UUID.fromString("00000000-0000-0000-0000-000000000001"), copy.barcode(), branch, shelf, now, actor);
        var b = new Scan(UUID.fromString("00000000-0000-0000-0000-000000000002"), copy.barcode(), branch, shelf, now, actor);
        var first = detector.detect(session, List.of(copy), List.of(copy), List.of(b, a), true);
        assertThat(first).extracting(Anomaly::kind).containsExactly(Kind.DUPLICATE_SCAN);
        assertThat(first.getFirst().firstScanId()).isEqualTo(a.id());
        assertThat(first).isEqualTo(detector.detect(session, List.of(copy), List.of(copy), List.of(a, b), true));
    }

    @Test void missingCopyThatNoLongerExistsStillKeepsItsSnapshot() {
        var copy = copy("AVAILABLE"); var result = detector.detect(session, List.of(copy), List.of(), List.of(), true);
        assertThat(result.getFirst().current()).isNull();
        assertThat(result.getFirst().snapshot()).isEqualTo(copy);
    }
}
