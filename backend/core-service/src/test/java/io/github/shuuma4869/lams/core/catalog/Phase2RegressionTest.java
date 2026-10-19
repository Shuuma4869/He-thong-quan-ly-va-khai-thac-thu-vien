package io.github.shuuma4869.lams.core.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import io.github.shuuma4869.lams.core.catalog.book.application.BookService;
import io.github.shuuma4869.lams.core.catalog.book.infrastructure.BookRepository;
import io.github.shuuma4869.lams.core.catalog.category.application.CategoryService;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import io.github.shuuma4869.lams.core.inventory.copy.application.BookCopyService;
import io.github.shuuma4869.lams.core.inventory.copy.infrastructure.BookCopyRepository;
import io.github.shuuma4869.lams.core.inventory.shelf.application.ShelfService;
import io.github.shuuma4869.lams.core.inventory.shelf.infrastructure.ShelfRepository;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class Phase2RegressionTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("phase2").withUsername("lams").withPassword("test-password");
    @DynamicPropertySource static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("lams.auth.jwt-secret", () -> "phase2-test-secret-with-at-least-32-bytes");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired CategoryService categories;
    @Autowired BookService books;
    @Autowired ShelfService shelves;
    @Autowired BookCopyService copies;
    @MockitoSpyBean ShelfRepository shelfRepository;
    @MockitoSpyBean BookCopyRepository copyRepository;
    @MockitoSpyBean BookRepository bookRepository;
    UUID staff, book, edition, author, category, publisher, branchA, branchB, shelf;

    @BeforeEach void fixture() {
        jdbc.execute("TRUNCATE book_copies,editions,book_authors,book_categories,books,authors,categories,publishers,shelves,branches CASCADE");
        staff = user("LIBRARIAN");
        author = UUID.randomUUID(); category = UUID.randomUUID(); publisher = UUID.randomUUID();
        book = UUID.randomUUID(); edition = UUID.randomUUID();
        branchA = UUID.randomUUID(); branchB = UUID.randomUUID(); shelf = UUID.randomUUID();
        jdbc.update("INSERT INTO authors(id,name) VALUES (?, 'Tác giả')", author);
        jdbc.update("INSERT INTO categories(id,name,normalized_name) VALUES (?, 'Khoa học', 'khoa học')", category);
        jdbc.update("INSERT INTO publishers(id,name) VALUES (?, 'Nhà xuất bản')", publisher);
        jdbc.update("INSERT INTO books(id,title,normalized_title) VALUES (?, 'Alpha', 'alpha')", book);
        jdbc.update("INSERT INTO book_authors VALUES (?,?)", book, author);
        jdbc.update("INSERT INTO book_categories VALUES (?,?)", book, category);
        jdbc.update("INSERT INTO editions(id,book_id,publisher_id) VALUES (?,?,?)", edition, book, publisher);
        jdbc.update("INSERT INTO branches(id,code,name,status) VALUES (?, 'A', 'A', 'ACTIVE'), (?, 'B', 'B', 'ACTIVE')", branchA, branchB);
        jdbc.update("INSERT INTO shelves(id,branch_id,code,label,sort_order) VALUES (?,?,'S','S',0)", shelf, branchA);
    }

    private UUID user(String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at) "
                + "VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())", id, id.toString().substring(0,20), id+"@test.invalid", id+"@test.invalid", "Test");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)", id, role);
        return id;
    }
    private RequestPostProcessor token(UUID id, String role) {
        return jwt().jwt(jwt -> jwt.subject(id.toString())).authorities(new SimpleGrantedAuthority("ROLE_"+role));
    }
    private List<String> readable() {
        return List.of("/books", "/books/"+book, "/authors", "/authors/"+author,
                "/categories", "/categories/"+category, "/publishers", "/publishers/"+publisher,
                "/books/"+book+"/editions", "/books/"+book+"/editions/"+edition);
    }

    @ParameterizedTest @ValueSource(strings = {"READER", "LIBRARIAN", "ADMIN"})
    void activeRolesReadCatalogAndWritesRemainStaffOnly(String role) throws Exception {
        UUID id = user(role);
        for (String path : readable()) mvc.perform(get("/api/v1"+path).with(token(id,role))).andExpect(status().isOk());
        for (String path : List.of("/authors", "/categories", "/publishers", "/books", "/books/"+book+"/editions")) {
            String body = path.equals("/books") ? "{\"title\":\"New\",\"authorIds\":[],\"categoryIds\":[]}"
                    : path.endsWith("editions") ? "{}" : "{\"name\":\"New\"}";
            mvc.perform(post("/api/v1"+path).with(token(id,role)).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(role.equals("READER") ? status().isForbidden() : status().isCreated());
        }
        if (role.equals("READER")) {
            for (String path : List.of("/authors/"+author, "/categories/"+category, "/publishers/"+publisher, "/books/"+book,
                    "/books/"+book+"/editions/"+edition)) {
                mvc.perform(delete("/api/v1"+path).with(token(id,role))).andExpect(status().isForbidden());
            }
            for (String path : List.of("/branches", "/shelves", "/copies"))
                mvc.perform(get("/api/v1"+path).with(token(id,role))).andExpect(status().isForbidden());
        }
    }

    @Test void anonymousCannotReadCatalog() throws Exception {
        for (String path : readable()) mvc.perform(get("/api/v1"+path)).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest @ValueSource(strings = {"LOCKED", "DISABLED", "REVOKED"})
    void staleJwtCannotBypassCurrentDatabaseStatusOrRoles(String state) throws Exception {
        if (state.equals("REVOKED")) jdbc.update("DELETE FROM user_roles WHERE user_id=?", staff);
        else jdbc.update("UPDATE users SET status=? WHERE id=?", state, staff);
        for (String path : readable()) mvc.perform(get("/api/v1"+path).with(token(staff,"LIBRARIAN"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/authors").with(token(staff,"LIBRARIAN"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Forbidden\"}")).andExpect(status().isForbidden());
    }

    @Test void unicodeEquivalentCategoryConflictsAndWhitespaceOnlyIsInvalid() throws Exception {
        for (String name : List.of("\u00a0KHOA\u00a0HỌC\u00a0", "\u2003Khoa\t học\u2003")) {
            assertThatThrownBy(() -> categories.create(staff,name)).isInstanceOfSatisfying(AuthFailure.class,
                    failure -> assertThat(failure.status()).isEqualTo(409));
        }
        assertThatThrownBy(() -> categories.create(staff,"\u00a0\u2003")).isInstanceOfSatisfying(AuthFailure.class,
                failure -> assertThat(failure.status()).isEqualTo(422));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM categories", Integer.class)).isEqualTo(1);
    }

    @Test void serverFiltersComposeWithStablePagesAndLiteralWildcards() throws Exception {
        books.create(staff,"Alpha second",null,List.of(author),List.of(category));
        books.create(staff,"Alpha unrelated",null,List.of(),List.of());
        books.create(staff,"100%_coverage",null,List.of(),List.of());
        var page = books.list(staff,"0","1","\u00a0ALPHA\u00a0",author.toString(),category.toString());
        assertThat(page.page().totalElements()).isEqualTo(2);
        assertThat(page.page().totalPages()).isEqualTo(2);
        assertThat(page.items()).extracting("id").containsExactly(book);
        assertThat(books.list(staff,"1","1","Alpha",author.toString(),category.toString()).items()).extracting("title").containsExactly("Alpha second");
        for (String term : List.of("not-present", "' OR 1=1 --", "\\"))
            assertThat(books.list(staff,null,null,term,null,null).page().totalElements()).isZero();
        assertThat(books.list(staff,null,null,"%_",null,null).items()).extracting("title").containsExactly("100%_coverage");
        assertThat(books.list(staff,null,null,null,UUID.randomUUID().toString(),null).items()).isEmpty();
        for (String field : List.of("authorId", "categoryId"))
            mvc.perform(get("/api/v1/books").param(field,"1-1-1-1-1").with(token(staff,"LIBRARIAN"))).andExpect(status().isUnprocessableEntity());
    }

    @Test void realForeignKeysPreventDeletingReferencedCatalogAndBarcodeMustBeUnique() throws Exception {
        copies.create(staff,edition,"BC-1",shelf);
        for (String path : List.of("/authors/"+author, "/categories/"+category, "/publishers/"+publisher,
                "/books/"+book, "/books/"+book+"/editions/"+edition))
            mvc.perform(delete("/api/v1"+path).with(token(staff,"LIBRARIAN"))).andExpect(status().isConflict());
        assertThatThrownBy(() -> copies.create(staff,edition,"BC-1",shelf)).isInstanceOfSatisfying(AuthFailure.class,
                failure -> assertThat(failure.status()).isEqualTo(409));
        assertThatThrownBy(() -> copies.create(staff,UUID.randomUUID(),"BC-2",shelf)).isInstanceOfSatisfying(AuthFailure.class,
                failure -> assertThat(failure.status()).isEqualTo(404));
    }

    @Test void bookRelationFailureAfterWritingRollsBackTitleAndRelations() {
        doAnswer(call -> {
            call.callRealMethod();
            jdbc.update("INSERT INTO book_authors(book_id,author_id) VALUES (?,?)", book, UUID.randomUUID());
            return true;
        }).when(bookRepository).update(any(),any());
        assertThatThrownBy(() -> books.update(staff,book,"Changed",null,List.of(),List.of()))
                .isInstanceOfSatisfying(AuthFailure.class, failure -> assertThat(failure.status()).isEqualTo(404));
        var restored = books.get(staff,book);
        assertThat(restored.title()).isEqualTo("Alpha");
        assertThat(restored.authors()).extracting("id").containsExactly(author);
        assertThat(restored.categories()).extracting("id").containsExactly(category);
    }

    @Test void copyUpdateRequiresVersionAndConcurrentUpdatesHaveOneWinner() throws Exception {
        var copy = copies.create(staff,edition,"BC",shelf);
        String body = "{\"editionId\":\""+edition+"\",\"shelfId\":\""+shelf+"\",\"barcode\":\"BC\"}";
        mvc.perform(patch("/api/v1/copies/"+copy.id()).with(token(staff,"LIBRARIAN"))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnprocessableEntity());
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Integer> update = () -> { start.await(); return outcome(() -> copies.update(staff,copy.id(),edition,"BC",shelf,0L)); };
            var first = pool.submit(update); var second = pool.submit(update); start.countDown();
            assertThat(List.of(first.get(10,TimeUnit.SECONDS),second.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }
        assertThat(copies.get(staff,copy.id()).version()).isEqualTo(1);
    }

    @Test void copyInsertLocksShelfSoTransferWaitsAndRejectsNonemptyShelf() throws Exception {
        var locked = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> { locked.countDown(); assertThat(release.await(10,TimeUnit.SECONDS)).isTrue(); return call.callRealMethod(); })
                .when(copyRepository).create(any());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var insert = pool.submit(() -> copies.create(staff,edition,"BC",shelf));
            try {
                assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
                var transfer = pool.submit(() -> outcome(() -> shelves.update(staff,shelf,branchB,"S","S",0)));
                awaitDatabaseLock(); release.countDown();
                insert.get(10,TimeUnit.SECONDS);
                assertThat(transfer.get(10,TimeUnit.SECONDS)).isEqualTo(409);
            } finally { release.countDown(); }
        }
        assertThat(shelves.get(staff,shelf).branchId()).isEqualTo(branchA);
    }

    @Test void transferLocksShelfUntilCommitBeforeCopyCanBeInserted() throws Exception {
        var locked = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> { locked.countDown(); assertThat(release.await(10,TimeUnit.SECONDS)).isTrue(); return call.callRealMethod(); })
                .when(shelfRepository).update(any());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var transfer = pool.submit(() -> shelves.update(staff,shelf,branchB,"S","S",0));
            try {
                assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
                var insert = pool.submit(() -> copies.create(staff,edition,"BC",shelf));
                awaitDatabaseLock(); release.countDown();
                assertThat(transfer.get(10,TimeUnit.SECONDS).branchId()).isEqualTo(branchB);
                assertThat(insert.get(10,TimeUnit.SECONDS).branchId()).isEqualTo(branchB);
            } finally { release.countDown(); }
        }
    }

    private void awaitDatabaseLock() {
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                        + "AND wait_event_type='Lock'", Integer.class)).isGreaterThan(0));
    }
    private static int outcome(Runnable action) {
        try { action.run(); return 200; } catch (AuthFailure failure) { return failure.status(); }
    }
}
