package io.github.shuuma4869.lams.core.catalog.review.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ReviewUpdateRequest(String body, @Min(1) @Max(5) Integer rating) {}
