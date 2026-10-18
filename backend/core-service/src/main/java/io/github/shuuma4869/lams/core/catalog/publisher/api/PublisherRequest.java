package io.github.shuuma4869.lams.core.catalog.publisher.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PublisherRequest(@NotBlank(message = "Tên nhà xuất bản không được để trống.")
                               @Size(max = 200, message = "Tên nhà xuất bản không được vượt quá 200 ký tự.")
                               String name) {}
