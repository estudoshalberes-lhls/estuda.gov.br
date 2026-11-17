# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Strict Ownership & Identity Binding**:
   - Every `/users/{userId}` document must have `ownerId == request.auth.uid` and `ownerId == userId`.
   - Every `/users/{userId}/dbRecords/{recordId}` document must have `ownerId == request.auth.uid` and `ownerId == userId`.
   - Only verified, allowlisted Google users (`request.auth.token.email_verified == true` and email in allowlist) may read or write workspace documents.
2. **Master Gate Relational Integrity**:
   - A `/users/{userId}/dbRecords/{recordId}` document cannot be read, created, updated, or deleted unless the parent `/users/{userId}` document exists and its `ownerId` equals `request.auth.uid`.
3. **Immortal Fields, Monotonic Revision & Temporal Integrity**:
   - `ownerId` and `createdAt` in `/users/{userId}` are strictly immutable on update.
   - `revision` (when present) must be monotonically non-decreasing (`incoming().revision >= existing().revision`).
   - `ownerId`, `section`, and `createdAt` in `/users/{userId}/dbRecords/{recordId}` are strictly immutable on update.
   - `createdAt` and `updatedAt` must equal `request.time` on creation; `updatedAt` must equal `request.time` on update.
4. **Volumetric & Schema Guardrails**:
   - Path variables `{userId}` and `{recordId}` must match `^[a-zA-Z0-9_\-]+$` with length `1..128`.
   - `hasAll` and `hasOnly` enforce exact key sets on creation, and `affectedKeys().hasOnly(...)` restricts updates to mutable fields only (`chunkHashes` bounded to 500 entries).
   - No PII (`email`, `phone`, `address`) is stored in workspace or database record documents, and all reads (`get` and `list`) require `request.auth.uid == userId && resource.data.ownerId == request.auth.uid`.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Identity Spoofing on Workspace Create)**:
   ```json
   {
     "path": "/users/user_victim",
     "auth": { "uid": "user_attacker", "email_verified": true },
     "op": "create",
     "data": {
       "ownerId": "user_victim",
       "contentHash": "hash123",
       "schemaVersion": 2,
       "sectionCount": 1,
       "timerState": { "elapsed": 0, "startedAt": 0 },
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
2. **Payload 2 (Unverified Email Write Attempt)**:
   ```json
   {
     "path": "/users/user_1",
     "auth": { "uid": "user_1", "email_verified": false },
     "op": "create",
     "data": {
       "ownerId": "user_1",
       "contentHash": "hash123",
       "schemaVersion": 2,
       "sectionCount": 1,
       "timerState": { "elapsed": 0, "startedAt": 0 },
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
3. **Payload 3 (Shadow Field / Ghost Key Injection on Create)**:
   ```json
   {
     "path": "/users/user_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "op": "create",
     "data": {
       "ownerId": "user_1",
       "contentHash": "hash123",
       "schemaVersion": 2,
       "sectionCount": 1,
       "timerState": { "elapsed": 0, "startedAt": 0 },
       "isAdmin": true,
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
4. **Payload 4 (Orphaned Subcollection Record Create Without Parent Workspace)**:
   ```json
   {
     "path": "/users/user_orphan/dbRecords/questions_0",
     "auth": { "uid": "user_orphan", "email_verified": true },
     "op": "create",
     "data": {
       "ownerId": "user_orphan",
       "section": "questions",
       "chunkIndex": 0,
       "chunkTotal": 1,
       "contentHash": "h1",
       "payload": { "kind": "array", "count": 0, "entries": {} },
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
5. **Payload 5 (Immortal Field Mutation — Changing `ownerId` on Update)**:
   ```json
   {
     "path": "/users/user_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "op": "update",
     "data": {
       "ownerId": "user_2",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
6. **Payload 6 (Immortal Field Mutation — Changing `createdAt` on Record Update)**:
   ```json
   {
     "path": "/users/user_1/dbRecords/questions_0",
     "auth": { "uid": "user_1", "email_verified": true },
     "op": "update",
     "data": {
       "contentHash": "h2",
       "createdAt": "2020-01-01T00:00:00Z",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
7. **Payload 7 (Forged Client Timestamp on Create)**:
   ```json
   {
     "path": "/users/user_1",
     "auth": { "uid": "user_1", "email_verified": true },
     "op": "create",
     "data": {
       "ownerId": "user_1",
       "contentHash": "hash123",
       "schemaVersion": 2,
       "sectionCount": 1,
       "timerState": { "elapsed": 0, "startedAt": 0 },
       "createdAt": "2099-01-01T00:00:00Z",
       "updatedAt": "2099-01-01T00:00:00Z"
     }
   }
   ```
8. **Payload 8 (ID Poisoning / Regex Violation in Path Variable)**:
   ```json
   {
     "path": "/users/user_1/dbRecords/questions$invalid!id",
     "auth": { "uid": "user_1", "email_verified": true },
     "op": "create",
     "data": {
       "ownerId": "user_1",
       "section": "questions",
       "chunkIndex": 0,
       "chunkTotal": 1,
       "contentHash": "h1",
       "payload": { "kind": "array" },
       "createdAt": "SERVER_TIMESTAMP",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
9. **Payload 9 (Value Poisoning on Update — Oversized String in `contentHash`)**:
   ```json
   {
     "path": "/users/user_1/dbRecords/questions_0",
     "auth": { "uid": "user_1", "email_verified": true },
     "op": "update",
     "data": {
       "contentHash": "A_STRING_EXCEEDING_128_CHARACTERS_LIMIT_...",
       "updatedAt": "SERVER_TIMESTAMP"
     }
   }
   ```
10. **Payload 10 (Cross-Tenant Read / Get Attempt)**:
    ```json
    {
      "path": "/users/user_1/dbRecords/questions_0",
      "auth": { "uid": "user_2", "email_verified": true },
      "op": "get"
    }
    ```
11. **Payload 11 (Unauthorized List Scraping Across User Collection)**:
    ```json
    {
      "path": "/users/user_1/dbRecords",
      "auth": { "uid": "user_2", "email_verified": true },
      "op": "list"
    }
    ```
12. **Payload 12 (Mutating Immutable `section` Field on `dbRecords` Update)**:
    ```json
    {
      "path": "/users/user_1/dbRecords/questions_0",
      "auth": { "uid": "user_1", "email_verified": true },
      "op": "update",
      "data": {
        "section": "laws",
        "updatedAt": "SERVER_TIMESTAMP"
      }
    }
    ```
