package io.github.shuuma4869.lams.core.catalog.publicapi;

import io.github.shuuma4869.lams.core.catalog.edition.domain.Edition;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public/catalog")
public class PublicCatalogController {
    public record MediaEnvelope(PublicCatalogService.Cover media) {}
    private final PublicCatalogService catalog;
    public PublicCatalogController(PublicCatalogService catalog) { this.catalog = catalog; }

    @GetMapping("/books")
    public PublicCatalogService.Result<PublicCatalogService.BookCard> books(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String query, @RequestParam(required = false) UUID authorId,
            @RequestParam(required = false) UUID categoryId, @RequestParam(required = false) String categoryTerm,
            @RequestParam(defaultValue = "title") String sort) {
        return catalog.books(page, size, query, authorId, categoryId, categoryTerm, sort);
    }
    @GetMapping("/books/{id}")
    public PublicCatalogService.BookCard book(@PathVariable UUID id) { return catalog.book(id); }
    @GetMapping("/books/{id}/editions")
    public PublicCatalogService.Result<Edition> editions(@PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return catalog.editions(id, page, size);
    }
    @GetMapping("/{kind:authors|categories}")
    public PublicCatalogService.Result<PublicCatalogService.Named> names(@PathVariable String kind,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String query) {
        return catalog.names(kind, page, size, query);
    }
    @GetMapping("/{kind:authors|categories}/{id}")
    public PublicCatalogService.Named name(@PathVariable String kind, @PathVariable UUID id) {
        return catalog.name(kind, id);
    }
    @GetMapping("/editions/{id}/media")
    public MediaEnvelope editionCover(@PathVariable UUID id) { return new MediaEnvelope(catalog.editionCover(id)); }
}
