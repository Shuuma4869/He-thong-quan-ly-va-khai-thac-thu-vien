package io.github.shuuma4869.lams.core.catalog.review.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.AssertTrue;
import com.fasterxml.jackson.annotation.JsonSetter;

public class ReviewUpdateRequest {
    private String body;
    @Min(1) @Max(5) private Integer rating;
    private boolean bodyPresent;
    private boolean ratingPresent;

    @JsonSetter("body") public void setBody(String value) { bodyPresent = true; body = value; }
    @JsonSetter("rating") public void setRating(Integer value) { ratingPresent = true; rating = value; }
    public String body() { return body; }
    public Integer rating() { return rating; }

    @AssertTrue(message = "Cung cấp body hoặc rating; field gửi lên không được là null.")
    public boolean isPatchValid() {
        return (bodyPresent || ratingPresent) && (!bodyPresent || body != null) && (!ratingPresent || rating != null);
    }
}
