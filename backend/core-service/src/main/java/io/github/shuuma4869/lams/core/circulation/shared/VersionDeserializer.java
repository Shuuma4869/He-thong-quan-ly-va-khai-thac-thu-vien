package io.github.shuuma4869.lams.core.circulation.shared;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;

public class VersionDeserializer extends JsonDeserializer<Long> {
    @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (!parser.currentToken().isNumeric()) {
            return (Long) context.handleUnexpectedToken(Long.class, parser);
        }
        try { return parser.getDecimalValue().longValueExact(); }
        catch (ArithmeticException error) {
            return (Long) context.handleWeirdNumberValue(Long.class, parser.getDecimalValue(), "Version phải là số nguyên int64.");
        }
    }
}
