package io.github.shuuma4869.lams.core.inventory.copy.application;

import java.time.Instant;
import java.util.UUID;

/** Sự kiện nội bộ đồng bộ; lỗi listener phải rollback transaction đang đổi Copy. */
public record CopyAvailable(UUID copyId, UUID bookId, UUID actorId, Instant at) {}
