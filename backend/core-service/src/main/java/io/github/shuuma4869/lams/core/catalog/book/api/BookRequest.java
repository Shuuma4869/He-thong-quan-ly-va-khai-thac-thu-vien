package io.github.shuuma4869.lams.core.catalog.book.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record BookRequest(@NotBlank(message = "Tên sách không được để trống.")
                          @Size(max = 500, message = "Tên sách không được vượt quá 500 ký tự.") String title,
                          @Size(max = 10000, message = "Mô tả không được vượt quá 10000 ký tự.") String description,
                          @NotNull(message = "Danh sách tác giả không được để trống.")
                          @Size(max = 100, message = "Mỗi sách chỉ được gắn tối đa 100 tác giả.") List<UUID> authorIds,
                          @NotNull(message = "Danh sách thể loại không được để trống.")
                          @Size(max = 100, message = "Mỗi sách chỉ được gắn tối đa 100 thể loại.") List<UUID> categoryIds) {}
