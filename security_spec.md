# Security Specification — AtlasGenie Firestore Rules

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched (`/{document=**}`) deny all reads and writes.
2. **PII Isolation (`/users/{userId}`)**: User documents contain `email` and notification preferences. Only the authenticated owner (`request.auth.uid == userId`) with a verified email may read, create, or update their own user profile. No `list` operation is permitted on `/users`.
3. **Trip Ownership & Group Access (`/trips/{tripId}`)**:
   - Only an authenticated user with `email_verified == true` can create a trip where `ownerId == request.auth.uid`.
   - Only the trip owner (`ownerId == request.auth.uid`) or a member (`request.auth.uid in memberIds`) can read/list a trip.
   - Terminal State Locking: Once `status == 'completed'`, no further updates are permitted on the trip document.
   - Immutable Fields: `id`, `ownerId`, `inviteCode`, and `createdAt` cannot be modified after creation.
4. **Master Gate Relational Sync (`/trips/{tripId}/travelers`, `/days`, `/expenses`)**:
   - Subcollection documents (`travelers`, `days`, `expenses`) require parent `/trips/{tripId}` existence and verify membership via `get()` on single-document operations (`get`, `create`, `update`, `delete`), while `list` operations enforce `resource.data.ownerId == request.auth.uid` to prevent O(n) `get()` cost explosions.
   - All string fields enforce strict `.size()` bounds and ID fields match `^[a-zA-Z0-9_\-]+$`.
   - Timestamps (`createdAt`, `updatedAt`) must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Trip Create**: Authenticated user `uid_attacker` creates `/trips/trip_1` with `ownerId: "uid_victim"`. -> `PERMISSION_DENIED`
2. **Shadow Field Injection on Trip Update**: Trip owner updates `/trips/trip_1` with `{ destination: "Porto", isAdmin: true }`. -> `PERMISSION_DENIED`
3. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create `/users/uid_1`. -> `PERMISSION_DENIED`
4. **PII Blanket Read on Users**: User `uid_attacker` attempts `get(/users/uid_victim)` or `list(/users)`. -> `PERMISSION_DENIED`
5. **Terminal State Bypass**: Trip owner attempts to update `/trips/trip_completed` when `existing().status == 'completed'`. -> `PERMISSION_DENIED`
6. **Immortal Field Mutation**: Trip owner updates `/trips/trip_1` changing `ownerId` or `createdAt`. -> `PERMISSION_DENIED`
7. **ID Poisoning / Resource Exhaustion**: Attacker attempts `create` on `/trips/invalid$id!@#` or sends a 5,000-character `destination`. -> `PERMISSION_DENIED`
8. **Orphaned Subcollection Write**: User attempts to create `/trips/non_existent_trip/expenses/exp_1` where parent trip does not exist. -> `PERMISSION_DENIED`
9. **Unauthorized Subcollection Read**: Non-member `uid_outsider` attempts `get` on `/trips/trip_1/days/day_1`. -> `PERMISSION_DENIED`
10. **Value Poisoning on Update**: Member updates `settled` on an expense with a string `"yes"` instead of a boolean. -> `PERMISSION_DENIED`
11. **Forged Client Timestamp**: User creates a trip with `createdAt` set to a past timestamp (`request.time - 1000s`). -> `PERMISSION_DENIED`
12. **Unbounded Array Injection**: User creates a trip with 25 elements in `interests` (exceeding max 10). -> `PERMISSION_DENIED`
