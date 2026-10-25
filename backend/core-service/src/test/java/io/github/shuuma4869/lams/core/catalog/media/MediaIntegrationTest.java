package io.github.shuuma4869.lams.core.catalog.media;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.UUID;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest @AutoConfigureMockMvc @Testcontainers
class MediaIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>("postgres:17.6-alpine")
            .withDatabaseName("media").withUsername("lams").withPassword("test-password");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",POSTGRES::getJdbcUrl);registry.add("spring.datasource.username",POSTGRES::getUsername);
        registry.add("spring.datasource.password",POSTGRES::getPassword);registry.add("lams.auth.jwt-secret",()->"media-test-secret-with-at-least-32-bytes");
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @MockitoBean MediaInspector inspector;
    UUID staff,reader,author;
    @BeforeEach void fixture() {
        staff=user("LIBRARIAN");reader=user("READER");author=UUID.randomUUID();
        jdbc.update("INSERT INTO authors(id,name) VALUES (?,'Author')",author);
        when(inspector.inspect(any())).thenReturn(new MediaInspector.Inspection("image/jpeg",300));
    }
    UUID user(String role) {
        UUID id=UUID.randomUUID();jdbc.update("INSERT INTO users VALUES (?,?,?,?,?,'test-only','ACTIVE',now(),now())",id,id.toString().substring(0,20),id+"@test.invalid",id+"@test.invalid","Test");
        jdbc.update("INSERT INTO user_roles VALUES (?,?)",id,role);return id;
    }
    RequestPostProcessor token(UUID id,String role) { return jwt().jwt(j->j.subject(id.toString())).authorities(new SimpleGrantedAuthority("ROLE_"+role)); }
    String path() { return "/api/v1/catalog-media/authors/"+author; }
    Map<String,Object> body() { return new java.util.HashMap<>(Map.of("source","wikimedia","sourceId","Q1:Portrait.jpg",
            "sourceUrl","https://commons.wikimedia.org/wiki/File:Portrait.jpg","imageUrl","https://upload.wikimedia.org/wikipedia/commons/a/ab/Portrait.jpg",
            "license","CC BY-SA 4.0","licenseUrl","https://creativecommons.org/licenses/by-sa/4.0/","attribution","Photographer",
            "evidence","Open Library OL1A links to Wikidata Q1; staff checked identity.","confirmed",true)); }
    @Test void staffApprovesReaderSeesProvenanceAndVersionPreventsOverwrite() throws Exception {
        mvc.perform(get(path()).with(token(reader,"READER"))).andExpect(status().isOk()).andExpect(jsonPath("$.media").doesNotExist());
        var initial=mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.approvedBy").value(staff.toString())).andReturn();
        long initialVersion=json.readTree(initial.getResponse().getContentAsString()).get("version").asLong();
        mvc.perform(get(path()).with(token(reader,"READER"))).andExpect(status().isOk()).andExpect(jsonPath("$.media.license").value("CC BY-SA 4.0"));
        mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body()))).andExpect(status().isConflict());
        var update=body();update.put("expectedVersion",initialVersion);
        var updated=mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(update))).andExpect(status().isOk()).andReturn();
        long newVersion=json.readTree(updated.getResponse().getContentAsString()).get("version").asLong();
        assertThat(newVersion).isGreaterThan(initialVersion);
        mvc.perform(delete(path()).param("version",Long.toString(initialVersion)).with(token(staff,"LIBRARIAN"))).andExpect(status().isConflict());
        mvc.perform(delete(path()).param("version",Long.toString(newVersion)).with(token(staff,"LIBRARIAN"))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog_media_references WHERE author_id=?",Integer.class,author)).isZero();
        assertThat(json.readTree(initial.getResponse().getContentAsString()).get("byteSize").asInt()).isEqualTo(300);
    }
    @Test void readerAndAnonymousCannotApproveAndConfirmationIsRequired() throws Exception {
        mvc.perform(get(path())).andExpect(status().isUnauthorized());
        mvc.perform(post(path()).with(token(reader,"READER")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body()))).andExpect(status().isForbidden());
        var unconfirmed=body();unconfirmed.put("confirmed",false);
        mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(unconfirmed))).andExpect(status().isUnprocessableEntity());
        verifyNoInteractions(inspector);
    }
    @Test void staleApprovalCannotOverwriteOrRemoveRecreatedReference() throws Exception {
        var first=mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body())))
                .andExpect(status().isOk()).andReturn();
        long oldVersion=json.readTree(first.getResponse().getContentAsString()).get("version").asLong();
        mvc.perform(delete(path()).param("version",Long.toString(oldVersion)).with(token(staff,"LIBRARIAN"))).andExpect(status().isNoContent());
        mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body()))).andExpect(status().isOk());
        var stale=body();stale.put("expectedVersion",oldVersion);
        mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(stale))).andExpect(status().isConflict());
        mvc.perform(delete(path()).param("version",Long.toString(oldVersion)).with(token(staff,"LIBRARIAN"))).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog_media_references WHERE author_id=?",Integer.class,author)).isOne();
    }
    @ParameterizedTest @ValueSource(strings={"LOCKED","DISABLED","REVOKED"})
    void staleStaffTokenCannotApprove(String state) throws Exception {
        if(state.equals("REVOKED"))jdbc.update("DELETE FROM user_roles WHERE user_id=?",staff);else jdbc.update("UPDATE users SET status=? WHERE id=?",state,staff);
        mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body()))).andExpect(status().isForbidden());
        verifyNoInteractions(inspector);
    }
    @Test void failedInspectionDoesNotPersistApproval() throws Exception {
        when(inspector.inspect(any())).thenThrow(new io.github.shuuma4869.lams.core.identity.application.AuthFailure(422,"MIME không hợp lệ"));
        mvc.perform(post(path()).with(token(staff,"LIBRARIAN")).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body()))).andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM catalog_media_references WHERE author_id=?",Integer.class,author)).isZero();
    }
}
