package io.github.shuuma4869.lams.core.circulation.shared;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class CommandExecutor {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public CommandExecutor(JdbcTemplate jdbc, ObjectMapper json, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.json = json;
        this.tx = new TransactionTemplate(transactions);
        this.tx.setTimeout(20);
    }

    public <T> T execute(UUID actor, UUID requestId, String command, Object request,
                         Class<T> responseType, Runnable authorize, Supplier<T> action) {
        if (actor == null || requestId == null) throw new AuthFailure(422, "Thiếu mã yêu cầu giao dịch.");
        String payload = encode(request);
        authorize.run();
        try {
            return tx.execute(transaction -> {
                jdbc.execute("SET LOCAL lock_timeout = '5s'");
                // Cùng actor/key chờ transaction trước; hash trùng chỉ gây chờ, không dùng để nhận diện request.
                jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",
                        "circulation-request:" + actor + ":" + requestId);
                authorize.run();
                var saved = jdbc.queryForList("""
                        SELECT command,request_payload::text,response_payload::text
                        FROM circulation_requests WHERE actor_id=? AND request_id=?
                        """, actor, requestId);
                if (!saved.isEmpty()) {
                    var receipt = saved.getFirst();
                    if (!command.equals(receipt.get("command"))
                            || !decode(payload, com.fasterxml.jackson.databind.JsonNode.class).equals(
                                decode((String) receipt.get("request_payload"), com.fasterxml.jackson.databind.JsonNode.class))) {
                        throw new AuthFailure(409, "Mã yêu cầu đã được dùng cho nội dung khác.");
                    }
                    return decode((String) receipt.get("response_payload"), responseType);
                }
                T result = action.get();
                jdbc.update("""
                        INSERT INTO circulation_requests(actor_id,request_id,command,request_payload,response_payload)
                        VALUES (?,?,?,?::jsonb,?::jsonb)
                        """, actor, requestId, command, payload, encode(result));
                return result;
            });
        } catch (PessimisticLockingFailureException conflict) {
            throw new AuthFailure(409, "Giao dịch khác đang xử lý dữ liệu này; vui lòng gửi lại cùng mã yêu cầu.");
        } catch (DataIntegrityViolationException conflict) {
            // Transaction đã rollback trước khi chuyển thành lỗi công khai; không truy vấn trong transaction bị hủy.
            throw new AuthFailure(409, "Dữ liệu giao dịch đã thay đổi hoặc không còn hợp lệ; hãy tải lại.");
        }
    }

    public String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException error) { throw new IllegalStateException("Không thể ghi dữ liệu giao dịch.", error); }
    }

    private <T> T decode(String value, Class<T> type) {
        try { return json.readValue(value, type); }
        catch (JsonProcessingException error) { throw new IllegalStateException("Không thể đọc dữ liệu giao dịch.", error); }
    }
}
