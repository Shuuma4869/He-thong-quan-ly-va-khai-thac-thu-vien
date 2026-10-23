package io.github.shuuma4869.lams.core.catalog.review.api;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;

/** Không cắt phần thập phân hoặc chuyển chuỗi thành điểm đánh giá. */
public final class RatingDeserializer extends JsonDeserializer<Integer> {
    @Override
    public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (parser.hasToken(JsonToken.VALUE_NUMBER_INT) || parser.hasToken(JsonToken.VALUE_NUMBER_FLOAT)) {
            try {
                return parser.getDecimalValue().intValueExact();
            } catch (ArithmeticException error) {
                return context.reportInputMismatch(Integer.class, "Điểm phải là số nguyên.");
            }
        }
        return context.reportInputMismatch(Integer.class, "Điểm phải là số nguyên JSON.");
    }
}
