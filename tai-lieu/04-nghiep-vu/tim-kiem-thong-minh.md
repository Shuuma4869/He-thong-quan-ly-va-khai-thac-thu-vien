# Workflow Smart Discovery

## Mục đích

Định hướng pipeline tìm kiếm nhiều tầng; Giai đoạn 01 chưa cài extension hay ranking.

```mermaid
flowchart TD
  Q[Query + filters] --> N[Normalize vi-VN]
  N --> F[PostgreSQL FTS]
  N --> T[pg_trgm fuzzy candidates]
  N -.sau này.-> V[pgvector semantic candidates]
  F --> R[Hybrid rank + business-safe signals]
  T --> R
  V -.-> R
  R --> Z{Có kết quả?}
  Z -- Có --> P[Paginate + availability projection]
  Z -- Không --> REC[Spell/fuzzy recovery + relax filters]
  REC --> EVT[SEARCH_ZERO_RESULT event]
```

Search document là projection, không thay catalog thật. Ranking cần version, offline evaluation và giải thích tối thiểu. `pg_trgm`/`pgvector` chỉ bật bằng migration khi image và benchmark được xác minh; starter không phụ thuộc chúng.
