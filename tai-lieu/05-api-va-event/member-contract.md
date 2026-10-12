# Member read API contract — Phase 1B baseline

Status: baseline for read-only Member API; no Member-specific editable fields have been approved.

## Ownership and persistence

Identity (`users`, `user_roles`, and `refresh_tokens`) remains the source of truth for account identity, roles, status, credentials, and session data. Member does not duplicate or modify those values. The current requirements do not establish any additional Member-owned business field. Therefore this baseline does **not** create an empty `member_profiles` table or a migration. `profile` is returned as `null`; GET requests never insert or update data.

Do not add PATCH or DELETE endpoints, account deletion, or fields such as phone, address, date of birth, gender, avatar, or bio without a product decision and reviewed contract. This explicitly defers the profile-metadata migration/domain-model tasks until actual Member-specific persisted fields are approved.

## Current member

`GET /api/v1/me/profile`

- Requires an authenticated ACTIVE account; READER, LIBRARIAN, and ADMIN can read their own record.
- The target UUID comes only from the authenticated JWT subject. The endpoint does not accept a user ID or permit scope switching.
- Returns `userId`, `memberCode`, `fullName`, `email`, `status`, and `profile: null`.
- An unknown principal returns 401; an account that is no longer ACTIVE returns 403.
- Read-only: no user, token, role, or profile row is inserted or updated.

## Staff member search

`GET /api/v1/members`

- LIBRARIAN and ADMIN only. Anonymous requests return 401; READER requests return 403.
- Rows come from Identity users, including users with no Member-specific profile data.
- Each item contains only `userId`, `memberCode`, `fullName`, and `status`. Email, roles, password data, and refresh-token data are excluded.
- Optional `query` searches `memberCode` or `fullName` (trimmed, max 150 characters; empty means no query). SQL wildcards are escaped and inputs are bound parameters.
- Optional `status` is ACTIVE, LOCKED, or DISABLED.
- Pagination: `page` defaults to 0; `size` defaults to 20 and is limited to 1–100. Response uses `{items, page:{number,size,totalElements,totalPages}}`.
- Sorting is allowlisted to `memberCode,asc|desc` and `fullName,asc|desc`, defaults to `memberCode,asc`, and uses user UUID as a stable tie-breaker.
- Invalid values return 422. SQL syntax/details are never exposed to the client.

## Deferred product decision

Profile editing requires a named Member-specific field, purpose, type, validation, authorization, and retention rule approved by product. Only then may a migration and PATCH contract be proposed and reviewed. Identity fields (email, fullName, memberCode, status, role, password, and token) remain outside Member editing.
