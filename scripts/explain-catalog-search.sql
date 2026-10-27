-- Kịch bản read-only tương ứng BookRepository.search(query='adventures', sort='relevance').
-- Chạy trên PostgreSQL demo: Get-Content scripts/explain-catalog-search.sql -Raw | docker exec -i lams-postgres-1 psql -U lams -d lams_core
PREPARE catalog_search(text, text, integer, bigint) AS
WITH q AS (
    SELECT lower(unaccent($1::text)) AS term,
           websearch_to_tsquery('simple', lower(unaccent($2::text))) AS tsq
), matches AS (
    SELECT b.id,b.normalized_title,b.updated_at,
        CASE
            WHEN EXISTS (SELECT 1 FROM editions e WHERE e.book_id=b.id AND e.isbn13=q.term) THEN 150.0
            WHEN b.search_title=q.term THEN 120.0
            WHEN starts_with(b.search_title,q.term) THEN 80.0
            WHEN b.search_vector @@ q.tsq THEN 50.0 + LEAST(ts_rank_cd(b.search_vector,q.tsq),1.0)*10.0
            WHEN EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id=ba.author_id
                         WHERE ba.book_id=b.id AND strpos(lower(unaccent(a.name)),q.term)>0) THEN 45.0
            WHEN strpos(b.search_title,q.term)>0 THEN 35.0
            ELSE similarity(b.search_title,q.term)*20.0
        END AS score
    FROM books b CROSS JOIN q
    WHERE (strpos(b.search_title,q.term)>0
        OR b.search_vector @@ q.tsq
        OR (length(q.term) >= 3 AND b.search_title % q.term)
        OR EXISTS (SELECT 1 FROM editions e WHERE e.book_id=b.id AND e.isbn13=q.term)
        OR EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id=ba.author_id
                   WHERE ba.book_id=b.id AND strpos(lower(unaccent(a.name)),q.term)>0))
)
SELECT id FROM matches ORDER BY score DESC,id LIMIT $3 OFFSET $4;

EXPLAIN (ANALYZE, BUFFERS) EXECUTE catalog_search('adventures','adventures',20,0);
