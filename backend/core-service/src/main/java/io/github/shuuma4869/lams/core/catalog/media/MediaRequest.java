package io.github.shuuma4869.lams.core.catalog.media;

import jakarta.validation.constraints.*;

public record MediaRequest(
        @NotBlank @Pattern(regexp="open-library|google-books|wikimedia|standard-ebooks") String source,
        @NotBlank @Size(max=500) String sourceId,
        @NotBlank @Size(max=2048) String sourceUrl,
        @NotBlank @Size(max=2048) String imageUrl,
        @NotBlank @Size(max=500) String license,
        @NotBlank @Size(max=2048) String licenseUrl,
        @NotBlank @Size(max=2000) String attribution,
        @NotBlank @Size(max=2000) String evidence,
        @AssertTrue(message="Cần xác nhận đúng tác phẩm/tác giả và quyền sử dụng ảnh.") boolean confirmed,
        @Min(0) Long expectedVersion) {}
