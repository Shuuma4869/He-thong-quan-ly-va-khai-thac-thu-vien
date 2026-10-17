package io.github.shuuma4869.lams.core.catalog.category.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryRequest(@NotBlank(message = "Tên thể loại không được để trống.")
                              @Size(max = 150, message = "Tên thể loại không được vượt quá 150 ký tự.")
                              String name) {}
