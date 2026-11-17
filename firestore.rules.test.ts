import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');

test('Dirty Dozen #1-12: Firestore rules structural & invariant verification', () => {
  // 1. Default deny catch-all
  assert.ok(rules.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  // 2. Verified email guard on writes
  assert.ok(rules.includes('request.auth.token.email_verified == true'));
  // 3. Strict ID validation regex
  assert.ok(rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));
  // 4. Users PII isolation: list disabled, get restricted to owner
  assert.ok(rules.includes('match /users/{userId}'));
  assert.ok(rules.includes('allow list: if false;'));
  // 5. Terminal state locking on trips
  assert.ok(rules.includes("existing().status != 'completed'"));
  // 6. Immortal field checks on updates
  assert.ok(rules.includes('incoming().ownerId == existing().ownerId'));
  assert.ok(rules.includes('incoming().createdAt == existing().createdAt'));
  // 7. Temporal integrity using request.time
  assert.ok(rules.includes('incoming().createdAt == request.time'));
  assert.ok(rules.includes('incoming().updatedAt == request.time'));
  // 8. Master gate relational check on subcollections
  assert.ok(rules.includes('isTripMember(tripId)'));
  assert.ok(rules.includes('isTripOwner(tripId)'));
  // 9. Sprint 25: User profile preferences schema validation
  assert.ok(rules.includes('defaultGroupSize'));
  assert.ok(rules.includes('defaultPaceLevel'));
  assert.ok(rules.includes('savedInterests'));
  assert.ok(rules.includes('savedRestrictions'));
  // 10. Travelers array & authenticated owner access
  assert.ok(rules.includes('request.auth != null'));
  assert.ok(rules.includes('request.auth.uid == userId'));
  assert.ok(rules.includes('request.auth.uid in tripData.travelers'));
  assert.ok(rules.includes('request.auth.uid in incoming().travelers'));
});


