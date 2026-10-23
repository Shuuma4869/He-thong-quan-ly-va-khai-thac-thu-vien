package io.github.shuuma4869.lams.core.catalog.favorite.application;

import io.github.shuuma4869.lams.core.catalog.favorite.domain.Favorite;
import io.github.shuuma4869.lams.core.catalog.favorite.infrastructure.FavoriteRepository;
import io.github.shuuma4869.lams.core.catalog.shared.CatalogAccess;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.identity.application.AuthService;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FavoriteService {
    public record PageMetadata(int number, int size, long totalElements, long totalPages) {}
    public record FavoritePage(List<Favorite> items, PageMetadata page) {}
    public record AddResult(Favorite favorite, boolean created) {}
    public record FavoriteState(UUID bookId, boolean saved) {}

    private final FavoriteRepository favorites;
    private final AuthService identity;

    public FavoriteService(FavoriteRepository favorites, AuthService identity) {
        this.favorites = favorites;
        this.identity = identity;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public FavoritePage list(UUID actorId, String pageValue, String sizeValue, String sortValue) {
        CatalogAccess.requireReader(identity, actorId);
        int page = parse(pageValue, 0, Integer.MAX_VALUE, "page");
        int size = parse(sizeValue, 20, 100, "size");
        if (size < 1) throw invalid("size phải nằm trong khoảng 1–100.");
        boolean ascending = sortAscending(sortValue);
        var result = favorites.list(actorId, page, size, ascending);
        long totalPages = result.totalElements() == 0 ? 0 : (result.totalElements() + size - 1) / size;
        return new FavoritePage(result.items(), new PageMetadata(page, size, result.totalElements(), totalPages));
    }

    @Transactional
    public AddResult add(UUID actorId, UUID bookId) {
        CatalogAccess.requireReader(identity, actorId);
        if (!favorites.bookExists(bookId)) throw notFound("Không tìm thấy sách.");

        for (int attempt = 0; attempt < 2; attempt++) {
            java.util.Optional<java.sql.Timestamp> insertedAt;
            try { insertedAt = favorites.insertIfAbsent(actorId, bookId); }
            catch (org.springframework.dao.DataIntegrityViolationException error) {
                if (error.getMostSpecificCause() instanceof java.sql.SQLException sql && "23503".equals(sql.getSQLState())) {
                    throw notFound("Sách hoặc tài khoản không còn tồn tại.");
                }
                throw error;
            }
            if (insertedAt.isPresent()) {
                var favorite = favorites.find(actorId, bookId)
                        .orElseThrow(() -> notFound("Sách không còn tồn tại."));
                return new AddResult(favorite, true);
            }
            var existing = favorites.find(actorId, bookId);
            if (existing.isPresent()) return new AddResult(existing.get(), false);
            if (!favorites.bookExists(bookId)) throw notFound("Không tìm thấy sách.");
        }
        throw new AuthFailure(409, "Favorite đang thay đổi; vui lòng thử lại.");
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public FavoriteState state(UUID actorId, UUID bookId) {
        CatalogAccess.requireReader(identity, actorId);
        if (!favorites.bookExists(bookId)) throw notFound("Không tìm thấy sách.");
        return new FavoriteState(bookId, favorites.find(actorId, bookId).isPresent());
    }

    @Transactional
    public void remove(UUID actorId, UUID bookId) {
        CatalogAccess.requireReader(identity, actorId);
        if (!favorites.bookExists(bookId)) throw notFound("Không tìm thấy sách.");
        favorites.delete(actorId, bookId);
    }

    private static boolean sortAscending(String sortValue) {
        String value = sortValue == null || sortValue.isBlank() ? "favoritedAt,desc" : sortValue.trim();
        return switch (value) {
            case "favoritedAt,asc" -> true;
            case "favoritedAt,desc" -> false;
            default -> throw invalid("sort chỉ nhận favoritedAt,asc hoặc favoritedAt,desc.");
        };
    }

    private static int parse(String value, int fallback, int max, String field) {
        if (value == null || value.isBlank()) return fallback;
        try {
            int number = Integer.parseInt(value);
            if (number < 0 || number > max) throw invalid(field + " nằm ngoài giới hạn cho phép.");
            return number;
        } catch (NumberFormatException error) {
            throw invalid(field + " phải là số nguyên.");
        }
    }

    private static AuthFailure invalid(String message) { return new AuthFailure(422, message); }
    private static AuthFailure notFound(String message) { return new AuthFailure(404, message); }
}
