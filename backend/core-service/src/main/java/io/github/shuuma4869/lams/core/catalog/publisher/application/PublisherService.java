package io.github.shuuma4869.lams.core.catalog.publisher.application;

import io.github.shuuma4869.lams.core.catalog.publisher.domain.Publisher;
import io.github.shuuma4869.lams.core.catalog.publisher.infrastructure.PublisherRepository;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import io.github.shuuma4869.lams.core.identity.domain.RoleCode;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublisherService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record PublisherPage(List<Publisher> items, PageMetadata page) {}
    private final PublisherRepository publishers;
    private final AuthService identity;

    public PublisherService(PublisherRepository publishers, AuthService identity) {
        this.publishers = publishers;
        this.identity = identity;
    }
    @Transactional
    public Publisher create(UUID actorId, String name) {
        requireStaff(actorId);
        return publishers.create(new Publisher(UUID.randomUUID(), normalizeName(name)));
    }
    public Publisher get(UUID actorId, UUID id) { requireStaff(actorId); return find(id); }
    public PublisherPage list(UUID actorId, String pageValue, String sizeValue) {
        requireStaff(actorId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size == 0) throw invalid("size phải nằm trong khoảng 1–100.");
        var result = publishers.list(page, size);
        long pages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new PublisherPage(result.items(), new PageMetadata(page, size, result.totalElements(), pages));
    }
    @Transactional
    public Publisher update(UUID actorId, UUID id, String name) {
        requireStaff(actorId);
        find(id);
        String normalized = normalizeName(name);
        try {
            if (!publishers.update(new Publisher(id, normalized))) throw new AuthFailure(404, "Không tìm thấy nhà xuất bản.");
        } catch (DataIntegrityViolationException referenced) {
            throw new AuthFailure(409, "Không thể cập nhật nhà xuất bản vì dữ liệu đang được tham chiếu.");
        }
        return new Publisher(id, normalized);
    }
    @Transactional
    public void delete(UUID actorId, UUID id) {
        requireStaff(actorId);
        find(id);
        try {
            if (!publishers.delete(id)) throw new AuthFailure(404, "Không tìm thấy nhà xuất bản.");
        } catch (DataIntegrityViolationException referenced) {
            throw new AuthFailure(409, "Không thể xóa nhà xuất bản đang được ấn bản tham chiếu.");
        }
    }
    private Publisher find(UUID id) {
        return publishers.findById(id).orElseThrow(() -> new AuthFailure(404, "Không tìm thấy nhà xuất bản."));
    }
    private void requireStaff(UUID id) {
        var actor = identity.currentUser(id);
        if (actor.roles().stream().noneMatch(r -> r == RoleCode.LIBRARIAN || r == RoleCode.ADMIN))
            throw new AuthFailure(403, "Bạn không có quyền quản lý nhà xuất bản.");
    }
    private static String normalizeName(String value) {
        if (value == null || value.isBlank()) throw invalid("Tên nhà xuất bản không được để trống.");
        String name = value.trim();
        if (name.length() > 200) throw invalid("Tên nhà xuất bản không được vượt quá 200 ký tự.");
        return name;
    }
    private static int parse(String value, int fallback, int max, String field) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int parsed = Integer.parseInt(value);
            if (parsed < 0 || parsed > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return parsed;
        } catch (NumberFormatException error) { throw invalid(field + " phải là số nguyên."); }
    }
    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }
}
