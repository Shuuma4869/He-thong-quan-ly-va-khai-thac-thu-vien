package io.github.shuuma4869.lams.core.catalog.publicapi;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.shuuma4869.lams.core.catalog.shared.CatalogText;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest @AutoConfigureMockMvc @Testcontainers
class PublicCatalogIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("public_catalog").withUsername("lams").withPassword("test-password");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "public-catalog-secret-with-at-least-32-bytes");
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test void availabilityUsesLiveCopyLoanAndHoldFactsWithoutExposingCopyDetails() throws Exception {
        UUID book = UUID.randomUUID(), edition = UUID.randomUUID(), active = UUID.randomUUID();
        UUID disabled = UUID.randomUUID(), activeShelf = UUID.randomUUID(), disabledShelf = UUID.randomUUID();
        UUID reader = UUID.randomUUID(), waitingReader = UUID.randomUUID();
        UUID free = UUID.randomUUID(), loaned = UUID.randomUUID();
        UUID inconsistentLoan = UUID.randomUUID(), reserved = UUID.randomUUID(), lost = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Khả dụng','khả dụng')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        jdbc.update("INSERT INTO branches(id,code,name) VALUES (?,'ACTIVE-TEST','Chi nhánh mở'),"
                + "(?,'DISABLED-TEST','Chi nhánh đóng')", active, disabled);
        jdbc.update("UPDATE branches SET status='DISABLED' WHERE id=?", disabled);
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label) VALUES (?,?,'A','Kệ A'),(?,?,'B','Kệ B')",
                activeShelf, active, disabledShelf, disabled);
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())", reader,
                "TV" + reader.toString().substring(0, 16), reader + "@test.invalid", reader + "@test.invalid", "Người đọc");
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())", waitingReader,
                "TV" + waitingReader.toString().substring(0, 16), waitingReader + "@test.invalid",
                waitingReader + "@test.invalid", "Người chờ");
        for (var item : java.util.List.of(free, loaned, inconsistentLoan, reserved, lost)) {
            String state = item.equals(loaned) ? "ON_LOAN" : item.equals(lost) ? "LOST" : "AVAILABLE";
            jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (?,?,?,?,?)",
                    item, edition, "BC-" + item, activeShelf, state);
        }
        jdbc.update("INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES (?,?,?,?, 'AVAILABLE')",
                UUID.randomUUID(), edition, "DISABLED-COPY-" + UUID.randomUUID(), disabledShelf);
        for (UUID item : java.util.List.of(loaned, inconsistentLoan)) {
            jdbc.update("INSERT INTO loans(id,copy_id,edition_id,reader_id,branch_id,borrowed_by,borrowed_at,due_at,"
                    + "policy_version,policy_snapshot) VALUES (?,?,?,?,?,?,now()-interval '1 day',"
                    + "now()+interval '1 day','test-v1','{}'::jsonb)",
                    UUID.randomUUID(), item, edition, reader, active, reader);
        }
        jdbc.update("INSERT INTO holds(id,reader_id,book_id,edition_id,branch_id,status,queued_at,ready_at,expires_at,"
                + "copy_id,policy_version,pickup_seconds) VALUES (?,?,?,?,?,'READY',now()-interval '1 hour',"
                + "now(),now()+interval '1 hour',?,'test-v1',3600)",
                UUID.randomUUID(), reader, book, edition, active, reserved);
        jdbc.update("INSERT INTO holds(id,reader_id,book_id,edition_id,branch_id,status,queued_at,policy_version,"
                + "pickup_seconds) VALUES (?,?,?,?,?,'WAITING',now(),'test-v1',3600)",
                UUID.randomUUID(), waitingReader, book, edition, active);
        String path = "/api/v1/public/catalog/books/{id}/availability";
        mvc.perform(get(path, book)).andExpect(status().isOk())
                .andExpect(jsonPath("$.checkedAt").exists())
                .andExpect(jsonPath("$.branches.length()").value(1))
                .andExpect(jsonPath("$.branches[0].editionId").value(edition.toString()))
                .andExpect(jsonPath("$.branches[0].availableCopies").value(1))
                .andExpect(jsonPath("$.branches[0].catalogedCopies").value(5))
                .andExpect(jsonPath("$.branches[0].waitingHolds").value(1))
                .andExpect(jsonPath("$.branches[0].barcode").doesNotExist());
        jdbc.update("UPDATE book_copies SET status='ON_LOAN' WHERE id=?", free);
        mvc.perform(get(path, book)).andExpect(status().isOk())
                .andExpect(jsonPath("$.branches[0].availableCopies").value(0));
        mvc.perform(get(path, UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test void batchCardsPreserveRequestedOrderAndBoundTheRequest() throws Exception {
        UUID first = UUID.randomUUID(), second = UUID.randomUUID(), missing = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Thẻ đầu','thẻ đầu'),(?,'Thẻ sau','thẻ sau')",
                first, second);
        String path = "/api/v1/public/catalog/books/batch";
        mvc.perform(get(path).param("bookId", second.toString(), missing.toString(), first.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(second.toString()))
                .andExpect(jsonPath("$[1].id").value(first.toString()))
                .andExpect(jsonPath("$[2]").doesNotExist());
        mvc.perform(get(path).param("bookId", first.toString(), first.toString()))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).param("bookId", first.toString()).param("bookId", second.toString()))
                .andExpect(status().isOk());
        mvc.perform(get(path).param("bookId", java.util.stream.IntStream.range(0, 21)
                .mapToObj(i -> UUID.randomUUID().toString()).toArray(String[]::new)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test void importedBookExposesSourceWithoutPretendingToHaveAnEdition() throws Exception {
        UUID book = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Nguồn thư mục','nguồn thư mục')", book);
        jdbc.update("""
                INSERT INTO catalog_external_sources(source_code,source_record_id,book_id,source_url,
                  source_snapshot_sha256,source_title,source_authors,ebook_released_on)
                VALUES ('PROJECT_GUTENBERG',?,?,'https://www.gutenberg.org/ebooks/12',
                  repeat('a',64),'Nguồn thư mục','Tác giả',DATE '2001-02-03')
                """, book.toString(), book);
        mvc.perform(get("/api/v1/public/catalog/books/{id}", book)).andExpect(status().isOk())
                .andExpect(jsonPath("$.catalogSource.sourceCode").value("PROJECT_GUTENBERG"))
                .andExpect(jsonPath("$.catalogSource.sourceUrl").value("https://www.gutenberg.org/ebooks/12"))
                .andExpect(jsonPath("$.catalogSource.ebookReleasedOn").value("2001-02-03"));
        mvc.perform(get("/api/v1/public/catalog/books").param("query", "Nguồn thư mục"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].catalogSource.sourceCode").value("PROJECT_GUTENBERG"));
        mvc.perform(get("/api/v1/public/catalog/books/{id}/editions", book)).andExpect(status().isOk())
                .andExpect(jsonPath("$.page.totalElements").value(0));
    }

    @Test void anonymousReaderAndStaffSeeOnlyBibliographicDataAndApprovedCover() throws Exception {
        UUID staff = UUID.randomUUID(), author = UUID.randomUUID(), category = UUID.randomUUID();
        UUID book = UUID.randomUUID(), older = UUID.randomUUID(), newer = UUID.randomUUID();
        jdbc.update("INSERT INTO users VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())", staff,
                staff.toString().substring(0, 20), staff + "@test.invalid", staff + "@test.invalid", "Staff");
        jdbc.update("INSERT INTO authors(id,name) VALUES (?,'Tác giả thật')", author);
        jdbc.update("INSERT INTO categories(id,name,normalized_name) VALUES (?,'Lịch sử','lịch sử')", category);
        jdbc.update("INSERT INTO books(id,title,normalized_title,description) VALUES (?,'Hành trình sách','hành trình sách','Mô tả công khai')", book);
        jdbc.update("INSERT INTO book_authors VALUES (?,?)", book, author);
        jdbc.update("INSERT INTO book_categories VALUES (?,?)", book, category);
        jdbc.update("INSERT INTO editions(id,book_id,publication_year) VALUES (?,?,2022),(?,?,2024)", older, book, newer, book);
        insertCover(older, staff, "wikimedia");
        insertCover(newer, staff, "open-library");
        jdbc.update("""
                INSERT INTO catalog_media_references(id,author_id,source,source_id,source_url,image_url,
                    license,license_url,attribution,evidence,mime,byte_size,approved_by,approved_at)
                VALUES (?,?,'wikimedia','author-portrait','https://commons.wikimedia.org/wiki/File:Author.jpg',
                    'https://upload.wikimedia.org/wikipedia/commons/a/a1/Author.jpg','CC BY-SA 4.0',
                    'https://creativecommons.org/licenses/by-sa/4.0/','Ảnh tác giả đã duyệt','Đối chiếu định danh',
                    'image/jpeg',500,?,now())
                """, UUID.randomUUID(), author, staff);
        jdbc.update("INSERT INTO reviews(id,user_id,book_id,body,rating) VALUES (?,?,?,'Sách hữu ích',4)",
                UUID.randomUUID(), staff, book);
        String list = "/api/v1/public/catalog/books";
        mvc.perform(get(list).param("query", "Hành trình")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].cover.editionId").value(newer.toString()))
                .andExpect(jsonPath("$.items[0].cover.attribution").value("Nguồn ảnh đã duyệt"))
                .andExpect(jsonPath("$.items[0].averageRating").value(4.00))
                .andExpect(jsonPath("$.items[0].ratingCount").value(1))
                .andExpect(jsonPath("$.items[0].cover.approvedBy").doesNotExist());
        mvc.perform(get(list).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_READER"))))
                .andExpect(status().isOk());
        mvc.perform(get(list).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_LIBRARIAN"))))
                .andExpect(status().isOk());
        mvc.perform(get(list).param("categoryId", category.toString())).andExpect(status().isOk())
                .andExpect(jsonPath("$.page.totalElements").value(1));
        mvc.perform(get(list).param("sort", "updated").param("size", "8"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(book.toString()));
        mvc.perform(get("/api/v1/public/catalog/categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].name").value("Lịch sử"));
        mvc.perform(get("/api/v1/public/catalog/categories").param("query", "lich su"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(category.toString()));
        mvc.perform(get("/api/v1/public/catalog/authors").param("query", "TAC GIA THAT"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(author.toString()));
        mvc.perform(get("/api/v1/public/catalog/authors/media").param("itemId", author.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].context").value("portrait"))
                .andExpect(jsonPath("$[0].attribution").value("Ảnh tác giả đã duyệt"))
                .andExpect(jsonPath("$[0].approvedBy").doesNotExist());
        mvc.perform(get("/api/v1/public/catalog/categories/media").param("itemId", category.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].context").value("book-cover"))
                .andExpect(jsonPath("$[0].attribution").value("Nguồn ảnh đã duyệt"));
        mvc.perform(get("/api/v1/public/catalog/categories/media").param("itemId", UUID.randomUUID().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0]").doesNotExist());
        mvc.perform(get("/api/v1/public/catalog/authors").param("query", "x".repeat(151)))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/public/catalog/books/{id}/editions", book)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));
        mvc.perform(get("/api/v1/public/catalog/editions/{id}/media", newer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.media.approvedBy").doesNotExist());
        mvc.perform(post("/api/v1/books")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/catalog-media/editions/{id}", newer)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM books WHERE id=?", Integer.class, book)).isOne();
    }

    @Test void validationAndUnapprovedMediaDoNotLeak() throws Exception {
        UUID book = UUID.randomUUID(), edition = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Không bìa','không bìa')", book);
        jdbc.update("INSERT INTO editions(id,book_id) VALUES (?,?)", edition, book);
        mvc.perform(get("/api/v1/public/catalog/books/{id}", book)).andExpect(status().isOk())
                .andExpect(jsonPath("$.cover").doesNotExist());
        mvc.perform(get("/api/v1/public/catalog/editions/{id}/media", edition)).andExpect(status().isOk())
                .andExpect(jsonPath("$.media").doesNotExist());
        mvc.perform(get("/api/v1/public/catalog/books").param("size", "51"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/public/catalog/books").param("sort", "recent").param("query", "sách"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/api/v1/public/catalog/books").param("categoryId", UUID.randomUUID().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test void updatedSortKeepsFiltersAndReturnsNewestFirst() throws Exception {
        UUID older = UUID.randomUUID(), newer = UUID.randomUUID();
        jdbc.update("INSERT INTO books(id,title,normalized_title,updated_at) VALUES (?,'Sort sample A','sort sample a','2025-01-01'),(?,'Sort sample B','sort sample b','2025-02-01')",
                older, newer);
        mvc.perform(get("/api/v1/public/catalog/books").param("query", "sort sample")
                        .param("sort", "updated").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].id").value(newer.toString()));
        mvc.perform(get("/api/v1/public/catalog/books").param("query", "sort sample")
                        .param("sort", "updated").param("size", "1").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(older.toString()));
    }

    @Test void relevanceSearchHandlesVietnameseIsbnAuthorAndStablePages() throws Exception {
        UUID exact = UUID.randomUUID(), prefix = UUID.randomUUID(), authorBook = UUID.randomUUID();
        UUID author = UUID.randomUUID(), edition = UUID.randomUUID(), category = UUID.randomUUID();
        jdbc.update("INSERT INTO authors(id,name) VALUES (?,'Nguyễn Bình')", author);
        jdbc.update("INSERT INTO categories(id,name,normalized_name) VALUES (?,'Truyện dài','truyện dài')", category);
        jdbc.update("INSERT INTO books(id,title,normalized_title,description) VALUES "
                + "(?,'Đường về','đường về','Một câu chuyện'),"
                + "(?,'Đường về nhà','đường về nhà','Một hành trình'),"
                + "(?,'Tập truyện khác','tập truyện khác','Đọc mỗi ngày')", exact, prefix, authorBook);
        jdbc.update("INSERT INTO book_authors(book_id,author_id) VALUES (?,?)", authorBook, author);
        jdbc.update("INSERT INTO book_categories(book_id,category_id) VALUES (?,?)", exact, category);
        jdbc.update("INSERT INTO editions(id,book_id,isbn13) VALUES (?,?,?)", edition, prefix, "9780140328721");
        String path = "/api/v1/public/catalog/books";
        mvc.perform(get(path).param("query", "duong ve").param("sort", "relevance").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].id").value(exact.toString()));
        mvc.perform(get(path).param("query", "duong ve").param("sort", "relevance")
                        .param("size", "1").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(prefix.toString()));
        mvc.perform(get(path).param("query", "9780140328721").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(prefix.toString()));
        mvc.perform(get(path).param("query", "nguyen binh").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(authorBook.toString()));
        mvc.perform(get(path).param("query", "nguyen binh").param("sort", "title"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1));
        mvc.perform(get(path).param("query", "duong ve nhaa").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(prefix.toString()));
        mvc.perform(get(path).param("query", "mot cau chuyen").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(exact.toString()));
        mvc.perform(get(path).param("query", "duong ve").param("sort", "relevance")
                        .param("categoryId", category.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1));
        mvc.perform(get(path).param("sort", "relevance"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).param("query", "' OR 1=1 --").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
        mvc.perform(get(path).param("query", "%").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
        jdbc.update("UPDATE books SET title='Đường mới',normalized_title='đường mới' WHERE id=?", exact);
        mvc.perform(get(path).param("query", "duong moi").param("sort", "relevance"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(exact.toString()));
    }

    @Test void titleSuggestionsArePublicBoundedAndRejectInvalidTerms() throws Exception {
        UUID target = UUID.randomUUID();
        String originalThreshold = jdbc.queryForObject("SELECT current_setting('pg_trgm.similarity_threshold')", String.class);
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Vườn gió mùa thiếc','vườn gió mùa thiếc')", target);
        String path = "/api/v1/public/catalog/books/suggestions";
        mvc.perform(get(path).param("query", "Vuon gio mua thiec"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(target.toString()))
                .andExpect(jsonPath("$[0].title").value("Vườn gió mùa thiếc"))
                .andExpect(jsonPath("$[5]").doesNotExist());
        mvc.perform(get(path).param("query", "zzzzkhongcosachnay2026"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(path).param("query", "ab")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).param("query", "x".repeat(151))).andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("SELECT current_setting('pg_trgm.similarity_threshold')", String.class))
                .isEqualTo(originalThreshold);
    }

    @Test void categoryAliasFilterUsesOneCanonicalCategoryAndRejectsAmbiguity() throws Exception {
        UUID science = UUID.randomUUID(), literature = UUID.randomUUID();
        UUID scienceBook = UUID.randomUUID(), literatureBook = UUID.randomUUID();
        String canonical = "Khoa học " + science.toString().substring(0, 8);
        String other = "Văn học " + literature.toString().substring(0, 8);
        try {
        jdbc.update("INSERT INTO categories(id,name,normalized_name) VALUES (?,?,?),(?,?,?)",
                science, canonical, CatalogText.key(canonical), literature, other, CatalogText.key(other));
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?,'Nghiên cứu thiên văn','nghiên cứu thiên văn'),"
                + "(?,'Tập thơ khác','tập thơ khác')", scienceBook, literatureBook);
        jdbc.update("INSERT INTO book_categories(book_id,category_id) VALUES (?,?),(?,?)",
                scienceBook, science, literatureBook, literature);
        jdbc.update("INSERT INTO category_aliases(id,category_id,alias_name,normalized_alias) VALUES (?,?,?,?)",
                UUID.randomUUID(), science, "Thiên văn học", CatalogText.key("Thiên văn học"));

        String path = "/api/v1/public/catalog/books";
        mvc.perform(get(path).param("categoryTerm", "  THIÊN VĂN HỌC  ").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(scienceBook.toString()));
        mvc.perform(get(path).param("categoryTerm", canonical))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(scienceBook.toString()));
        mvc.perform(get(path).param("categoryTerm", "Không có bí danh này"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(0));
        mvc.perform(get(path).param("categoryTerm", "Thiên văn học").param("categoryId", literature.toString()))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(get(path).param("categoryTerm", "  "))
                .andExpect(status().isUnprocessableEntity());

        jdbc.update("INSERT INTO category_aliases(id,category_id,alias_name,normalized_alias) VALUES (?,?,?,?)",
                UUID.randomUUID(), science, "Dữ liệu nhập sai", CatalogText.key(other));
        mvc.perform(get(path).param("categoryTerm", other))
                .andExpect(status().isConflict());
        } finally {
            jdbc.update("DELETE FROM category_aliases WHERE category_id IN (?,?)", science, literature);
            jdbc.update("DELETE FROM book_categories WHERE book_id IN (?,?)", scienceBook, literatureBook);
            jdbc.update("DELETE FROM books WHERE id IN (?,?)", scienceBook, literatureBook);
            jdbc.update("DELETE FROM categories WHERE id IN (?,?)", science, literature);
        }
    }

    private void insertCover(UUID edition, UUID staff, String source) {
        jdbc.update("""
            INSERT INTO catalog_media_references(id,edition_id,source,source_id,source_url,image_url,
                license,license_url,attribution,evidence,mime,byte_size,approved_by,approved_at)
            VALUES (?,?,?,'source-id','https://commons.wikimedia.org/wiki/File:Book.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/a/a1/Book.jpg','CC BY-SA 4.0',
                'https://creativecommons.org/licenses/by-sa/4.0/','Nguồn ảnh đã duyệt','Nhân viên đối chiếu ấn bản',
                'image/jpeg',500,?,now())
            """, UUID.randomUUID(), edition, source, staff);
    }
}
