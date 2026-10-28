package io.github.shuuma4869.lams.core.identity.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.shuuma4869.lams.core.identity.application.AccountCenterService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/ui-preferences")
public class UiPreferencesController {
    public record Preferences(int schemaVersion, int revision, Map<String, Object> values) {}
    public record Update(Integer schemaVersion, Integer revision, Map<String, Object> values) {}

    private static final Map<String, Set<String>> OPTIONS = Map.ofEntries(
            Map.entry("accent", Set.of("blue", "teal", "sky", "emerald", "sand")),
            Map.entry("glass", Set.of("subtle", "standard", "strong")),
            Map.entry("blur", Set.of("on", "off")),
            Map.entry("sidebarStyle", Set.of("floating", "classic")),
            Map.entry("sidebarState", Set.of("expanded", "collapsed")),
            Map.entry("density", Set.of("comfortable", "compact")),
            Map.entry("radius", Set.of("medium", "soft", "large")),
            Map.entry("fontSize", Set.of("standard", "large")),
            Map.entry("motion", Set.of("normal", "reduced", "off")),
            Map.entry("bookView", Set.of("grid", "list")));
    private static final Set<String> WIDGETS = Set.of("overview", "circulation", "inventory", "acquisition");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final AccountCenterService accounts;

    public UiPreferencesController(JdbcTemplate jdbc, ObjectMapper json, AccountCenterService accounts) {
        this.jdbc = jdbc; this.json = json; this.accounts = accounts;
    }

    @GetMapping
    public Preferences get(JwtAuthenticationToken token) {
        UUID userId = actor(token);
        accounts.current(userId);
        return jdbc.query("SELECT revision,preferences::text FROM user_ui_preferences WHERE user_id=?",
                (rs, row) -> new Preferences(1, rs.getInt(1), decode(rs.getString(2))), userId)
                .stream().findFirst().orElse(new Preferences(1, 0, Map.of()));
    }

    @PutMapping
    @Transactional
    public Preferences put(JwtAuthenticationToken token, @RequestBody Update body) {
        UUID userId = actor(token);
        accounts.current(userId);
        Map<String, Object> values = validate(body);
        String encoded;
        try { encoded = json.writeValueAsString(values); }
        catch (JsonProcessingException error) { throw new AuthFailure(422, "Thiết lập giao diện không hợp lệ."); }
        if (body.revision() == 0) {
            int inserted = jdbc.update("INSERT INTO user_ui_preferences(user_id,revision,schema_version,preferences) "
                    + "VALUES (?,1,1,?::jsonb) ON CONFLICT (user_id) DO NOTHING", userId, encoded);
            if (inserted == 0) throw new AuthFailure(409, "Thiết lập đã thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.");
            return new Preferences(1, 1, values);
        }
        int updated = jdbc.update("UPDATE user_ui_preferences SET preferences=?::jsonb,revision=revision+1,updated_at=now() "
                + "WHERE user_id=? AND revision=?", encoded, userId, body.revision());
        if (updated == 0) throw new AuthFailure(409, "Thiết lập đã thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.");
        return new Preferences(1, body.revision() + 1, values);
    }

    private static UUID actor(JwtAuthenticationToken token) { return UUID.fromString(token.getToken().getSubject()); }

    private Map<String, Object> decode(String encoded) {
        try { return json.readValue(encoded, new TypeReference<LinkedHashMap<String, Object>>() {}); }
        catch (JsonProcessingException error) { throw new IllegalStateException("Dữ liệu thiết lập giao diện không đọc được.", error); }
    }

    private static Map<String, Object> validate(Update body) {
        if (body == null || body.schemaVersion() == null || body.schemaVersion() != 1
                || body.revision() == null || body.revision() < 0 || body.values() == null
                || body.values().size() > OPTIONS.size() + 1)
            throw new AuthFailure(422, "Phiên bản hoặc dữ liệu thiết lập giao diện không hợp lệ.");
        Map<String, Object> result = new LinkedHashMap<>();
        for (var entry : body.values().entrySet()) {
            if ("widgets".equals(entry.getKey())) {
                if (!(entry.getValue() instanceof List<?> list) || list.size() > WIDGETS.size()
                        || list.stream().anyMatch(item -> !(item instanceof String name) || !WIDGETS.contains(name))
                        || list.stream().distinct().count() != list.size())
                    throw new AuthFailure(422, "Danh sách widget không hợp lệ.");
                result.put("widgets", list);
            } else if (!OPTIONS.containsKey(entry.getKey()) || !(entry.getValue() instanceof String value)
                    || !OPTIONS.get(entry.getKey()).contains(value)) {
                throw new AuthFailure(422, "Tùy chọn giao diện không hợp lệ.");
            } else result.put(entry.getKey(), entry.getValue());
        }
        return result;
    }
}
