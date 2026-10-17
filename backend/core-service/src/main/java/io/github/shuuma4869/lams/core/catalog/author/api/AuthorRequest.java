package io.github.shuuma4869.lams.core.catalog.author.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AuthorRequest(@NotBlank(message = "Tên tác giả không được để trống.")
                            @Size(max = 200, message = "Tên tác giả không được vượt quá 200 ký tự.")
                            String name) {}
