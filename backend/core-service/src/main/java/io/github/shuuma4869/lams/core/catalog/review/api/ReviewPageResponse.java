package io.github.shuuma4869.lams.core.catalog.review.api;

import io.github.shuuma4869.lams.core.catalog.review.application.ReviewService;
import java.util.List;

public record ReviewPageResponse(List<ReviewResponse> items, ReviewService.PageMetadata page) {}
