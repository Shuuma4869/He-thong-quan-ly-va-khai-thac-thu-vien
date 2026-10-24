package io.github.shuuma4869.lams.core.inventory.audit.domain;

import java.time.Instant;
import java.util.UUID;

/** Dữ liệu đối chiếu, không phải lệnh cập nhật bản sách. */
public final class InventoryEvidence {
    private InventoryEvidence() {}

    public enum Kind { WRONG_SHELF, EXPECTED_BUT_MISSING, STATUS_MISMATCH, WRONG_BRANCH, UNKNOWN_BARCODE, DUPLICATE_SCAN }

    public record Copy(UUID id, String barcode, UUID branchId, UUID shelfId, String status, long version) {
        public Copy {
            if (id == null || barcode == null || barcode.isBlank() || branchId == null || shelfId == null
                    || status == null || version < 0) throw new IllegalArgumentException("Bằng chứng bản sách không hợp lệ.");
        }
    }

    public record Scan(UUID id, String barcode, UUID branchId, UUID shelfId, Instant scannedAt, UUID actorId) {
        public Scan {
            if (id == null || barcode == null || barcode.isBlank() || branchId == null || shelfId == null
                    || scannedAt == null || actorId == null) throw new IllegalArgumentException("Bằng chứng quét không hợp lệ.");
        }
    }

    public record Anomaly(UUID id, Kind kind, UUID sessionId, UUID copyId, Scan scan,
                          Copy snapshot, Copy current, UUID firstScanId) {}
}
