package io.github.shuuma4869.lams.core.identity.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

class MemberContractTest {
    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) { return (Map<String, Object>) value; }

    @Test
    void memberOpenApiKeepsReadOnlyRoutesAndRequiredResponseFields() throws Exception {
        try (var stream = Files.newInputStream(Path.of("../../contracts/openapi/core-api.yaml"))) {
            Map<String, Object> document = new Yaml().load(stream);
            var paths = map(document.get("paths"));
            for (String path : java.util.List.of("/me/profile", "/members")) {
                var endpoint = map(paths.get(path));
                assertThat(endpoint.keySet()).containsExactly("get");
                var get = map(endpoint.get("get"));
                assertThat(get).containsKey("security");
                assertThat(map(get.get("responses"))).containsKeys("200", "401", "403");
            }
            assertThat(paths).doesNotContainKey("/members/me");
            var schemas = map(map(document.get("components")).get("schemas"));
            assertThat(map(map(schemas.get("MemberItem")).get("properties")).keySet())
                    .containsExactlyInAnyOrder("userId", "memberCode", "fullName", "status");
            assertThat(map(schemas.get("CurrentMemberProfile")).get("required"))
                    .isEqualTo(java.util.List.of("userId", "memberCode", "fullName", "email", "status", "profile"));
            assertThat(map(map(schemas.get("PageMetadata")).get("properties")).keySet())
                    .containsExactlyInAnyOrder("number", "size", "totalElements", "totalPages");
        }
    }
}
