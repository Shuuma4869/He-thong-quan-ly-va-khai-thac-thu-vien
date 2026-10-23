package io.github.shuuma4869.lams.core.catalog.review.api;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ReviewRequest(@NotBlank String body,
        @JsonDeserialize(using = RatingDeserializer.class) @NotNull @Min(1) @Max(5) Integer rating) {}
