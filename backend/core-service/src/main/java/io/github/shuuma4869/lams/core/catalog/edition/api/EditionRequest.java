package io.github.shuuma4869.lams.core.catalog.edition.api;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;

public record EditionRequest(@Pattern(regexp = "[0-9]{13}", message = "ISBN phải gồm đúng 13 chữ số.") String isbn13,
                             UUID publisherId,
                             @Min(value = 1000, message = "Năm xuất bản phải từ 1000 trở lên.")
                             @Max(value = 9999, message = "Năm xuất bản không được vượt quá 9999.")
                             Integer publicationYear,
                             @Size(max = 35, message = "Mã ngôn ngữ không được vượt quá 35 ký tự.") String language) {}
