package io.github.shuuma4869.lams.core.inventory.audit.application;

import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Anomaly;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Copy;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Kind;
import io.github.shuuma4869.lams.core.inventory.audit.domain.InventoryEvidence.Scan;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class AnomalyDetector {
    private static final Set<String> PHYSICALLY_EXPECTED = Set.of("AVAILABLE", "IN_PROCESS", "DAMAGED");

    public List<Anomaly> detect(UUID sessionId, List<Copy> snapshot, List<Copy> current,
                                 List<Scan> scans, boolean finalized) {
        if (sessionId == null) throw new IllegalArgumentException("Thiếu mã phiên kiểm kê.");
        Map<UUID, Copy> expected = index(snapshot);
        Map<UUID, Copy> actual = index(current);
        Map<String, Copy> byBarcode = new HashMap<>();
        for (Copy copy : current) {
            if (byBarcode.putIfAbsent(copy.barcode(), copy) != null)
                throw new IllegalArgumentException("Mã vạch hiện hành bị trùng.");
        }
        Map<UUID, Scan> uniqueScans = new LinkedHashMap<>();
        for (Scan scan : scans) {
            Scan previous = uniqueScans.putIfAbsent(scan.id(), scan);
            if (previous != null && !previous.equals(scan))
                throw new IllegalArgumentException("Một scan ID không được mang hai nội dung khác nhau.");
        }
        var ordered = uniqueScans.values().stream().sorted(Comparator.comparing(Scan::scannedAt)
                .thenComparing(s -> s.id().toString())).toList();
        var anomalies = new ArrayList<Anomaly>();
        Map<UUID, UUID> firstSeen = new HashMap<>();
        for (Scan scan : ordered) {
            Copy copy = byBarcode.get(scan.barcode());
            if (copy == null) {
                anomalies.add(anomaly(sessionId, Kind.UNKNOWN_BARCODE, null, scan, null, null, null));
                continue;
            }
            Copy before = expected.get(copy.id());
            UUID firstScan = firstSeen.putIfAbsent(copy.id(), scan.id());
            if (firstScan != null) {
                anomalies.add(anomaly(sessionId, Kind.DUPLICATE_SCAN, copy.id(), scan, before, copy, firstScan));
            }
            Copy location = before == null ? copy : before;
            if (!location.branchId().equals(scan.branchId())) {
                anomalies.add(anomaly(sessionId, Kind.WRONG_BRANCH, copy.id(), scan, before, copy, null));
            } else if (!location.shelfId().equals(scan.shelfId())) {
                anomalies.add(anomaly(sessionId, Kind.WRONG_SHELF, copy.id(), scan, before, copy, null));
            }
            // Có mặt vật lý nhưng trạng thái không kỳ vọng trên kệ, hoặc trạng thái đã đổi sau snapshot.
            if (!PHYSICALLY_EXPECTED.contains(copy.status()) || (before != null && !before.status().equals(copy.status()))) {
                anomalies.add(anomaly(sessionId, Kind.STATUS_MISMATCH, copy.id(), scan, before, copy, null));
            }
        }
        if (finalized) {
            expected.values().stream().sorted(Comparator.comparing(c -> c.id().toString()))
                    .filter(copy -> PHYSICALLY_EXPECTED.contains(copy.status()) && !firstSeen.containsKey(copy.id()))
                    .forEach(copy -> anomalies.add(anomaly(sessionId, Kind.EXPECTED_BUT_MISSING, copy.id(), null,
                            copy, actual.get(copy.id()), null)));
        }
        return List.copyOf(anomalies);
    }

    private static Map<UUID, Copy> index(List<Copy> copies) {
        var result = new HashMap<UUID, Copy>();
        for (Copy copy : copies) {
            if (result.putIfAbsent(copy.id(), copy) != null) throw new IllegalArgumentException("Bản sách bị trùng trong bằng chứng.");
        }
        return result;
    }

    private static Anomaly anomaly(UUID session, Kind kind, UUID copy, Scan scan, Copy snapshot, Copy current, UUID first) {
        String key = session + ":" + kind + ":" + (scan == null ? copy : scan.id());
        return new Anomaly(UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)), kind, session, copy,
                scan, snapshot, current, first);
    }
}
