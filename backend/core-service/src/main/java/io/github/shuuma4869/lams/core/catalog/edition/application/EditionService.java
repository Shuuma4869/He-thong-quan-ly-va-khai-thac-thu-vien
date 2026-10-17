package io.github.shuuma4869.lams.core.catalog.edition.application;

import io.github.shuuma4869.lams.core.catalog.edition.domain.Edition;
import io.github.shuuma4869.lams.core.catalog.edition.infrastructure.EditionRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EditionService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record EditionPage(List<Edition> items, PageMetadata page) {}
    private final EditionRepository editions;
    private final AuthService identity;
    private final JdbcTemplate jdbc;

    public EditionService(EditionRepository editions, AuthService identity, JdbcTemplate jdbc) {
        this.editions = editions; this.identity = identity; this.jdbc = jdbc;
    }
    @Transactional
    public Edition create(UUID actor, UUID bookId, String isbn, UUID publisherId, Integer year, String language) {
        requireStaff(actor); requireBook(bookId); requirePublisher(publisherId);
        var edition = new Edition(UUID.randomUUID(), bookId, null, isbn, publisherId, null, year, normalize(language));
        try { editions.create(edition); }
        catch (DataIntegrityViolationException invalid) { throw new AuthFailure(404, "Không tìm thấy sách hoặc nhà xuất bản."); }
        return find(bookId, edition.id());
    }
    public Edition get(UUID actor, UUID bookId, UUID id) { requireStaff(actor); requireBook(bookId); return find(bookId, id); }
    public EditionPage list(UUID actor, UUID bookId, String pageValue, String sizeValue) {
        requireStaff(actor); requireBook(bookId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = editions.list(bookId, page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new EditionPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }
    @Transactional
    public Edition update(UUID actor, UUID bookId, UUID id, String isbn, UUID publisherId, Integer year, String language) {
        requireStaff(actor); requireBook(bookId); requirePublisher(publisherId); find(bookId, id);
        try {
            if (!editions.update(new Edition(id, bookId, null, isbn, publisherId, null, year, normalize(language))))
                throw new AuthFailure(404, "Không tìm thấy ấn bản.");
        } catch (DataIntegrityViolationException invalid) {
            throw new AuthFailure(404, "Không tìm thấy nhà xuất bản được chọn.");
        }
        return find(bookId, id);
    }
    @Transactional
    public void delete(UUID actor, UUID bookId, UUID id) {
        requireStaff(actor); requireBook(bookId); find(bookId, id);
        try {
            if (!editions.delete(bookId, id)) throw new AuthFailure(404, "Không tìm thấy ấn bản.");
        } catch (DataIntegrityViolationException referenced) {
            throw new AuthFailure(409, "Không thể xóa ấn bản đang có bản sách vật lý tham chiếu.");
        }
    }
    private Edition find(UUID bookId, UUID id) {
        return editions.find(bookId, id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy ấn bản."));
    }
    private void requireBook(UUID id) {
        if (jdbc.queryForObject("SELECT count(*) FROM books WHERE id=?", Integer.class, id) == 0)
            throw new AuthFailure(404, "Không tìm thấy sách.");
    }
    private void requirePublisher(UUID id) {
        if (id != null && jdbc.queryForObject("SELECT count(*) FROM publishers WHERE id=?", Integer.class, id) == 0)
            throw new AuthFailure(404, "Không tìm thấy nhà xuất bản.");
    }
    private void requireStaff(UUID id) {
        var user = identity.currentUser(id);
        if (user.roles().stream().noneMatch(r -> r == RoleCode.LIBRARIAN || r == RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền quản lý ấn bản.");
    }
    private static String normalize(String value) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > 35) throw invalid("Mã ngôn ngữ không được vượt quá 35 ký tự.");
        return result;
    }
    private static int parse(String value, int fallback, int max, String field) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int result = Integer.parseInt(value);
            if (result < 0 || result > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return result;
        } catch (NumberFormatException error) { throw invalid(field + " phải là số nguyên."); }
    }
    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }
}
