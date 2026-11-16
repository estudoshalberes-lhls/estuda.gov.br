/**
 * Firestore Security Rules Verification Suite (Dirty Dozen Payloads)
 * Verifies that all 12 adversarial payloads in security_spec.md are rejected with PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  op: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Workspace Create',
    op: 'create',
    path: '/users/user_victim',
    auth: { uid: 'user_attacker', email_verified: true },
    payload: {
      ownerId: 'user_victim',
      contentHash: 'hash123',
      schemaVersion: 2,
      sectionCount: 1,
      timerState: { elapsed: 0, startedAt: 0 },
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write Attempt',
    op: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: false },
    payload: {
      ownerId: 'user_1',
      contentHash: 'hash123',
      schemaVersion: 2,
      sectionCount: 1,
      timerState: { elapsed: 0, startedAt: 0 },
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field / Ghost Key Injection on Create',
    op: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      ownerId: 'user_1',
      contentHash: 'hash123',
      schemaVersion: 2,
      sectionCount: 1,
      timerState: { elapsed: 0, startedAt: 0 },
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Orphaned Subcollection Record Create Without Parent Workspace',
    op: 'create',
    path: '/users/user_orphan/dbRecords/questions_0',
    auth: { uid: 'user_orphan', email_verified: true },
    payload: {
      ownerId: 'user_orphan',
      section: 'questions',
      chunkIndex: 0,
      chunkTotal: 1,
      contentHash: 'h1',
      payload: { kind: 'array', count: 0, entries: {} },
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Immortal Field Mutation — Changing ownerId on Update',
    op: 'update',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      ownerId: 'user_2',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immortal Field Mutation — Changing createdAt on Record Update',
    op: 'update',
    path: '/users/user_1/dbRecords/questions_0',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      contentHash: 'h2',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Forged Client Timestamp on Create',
    op: 'create',
    path: '/users/user_1',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      ownerId: 'user_1',
      contentHash: 'hash123',
      schemaVersion: 2,
      sectionCount: 1,
      timerState: { elapsed: 0, startedAt: 0 },
      createdAt: '2099-01-01T00:00:00Z',
      updatedAt: '2099-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning / Regex Violation in Path Variable',
    op: 'create',
    path: '/users/user_1/dbRecords/questions$invalid!id',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      ownerId: 'user_1',
      section: 'questions',
      chunkIndex: 0,
      chunkTotal: 1,
      contentHash: 'h1',
      payload: { kind: 'array' },
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on Update — Oversized String in contentHash',
    op: 'update',
    path: '/users/user_1/dbRecords/questions_0',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      contentHash: 'x'.repeat(200),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Cross-Tenant Read / Get Attempt',
    op: 'get',
    path: '/users/user_1/dbRecords/questions_0',
    auth: { uid: 'user_2', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unauthorized List Scraping Across User Collection',
    op: 'list',
    path: '/users/user_1/dbRecords',
    auth: { uid: 'user_2', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Mutating Immutable section Field on dbRecords Update',
    op: 'update',
    path: '/users/user_1/dbRecords/questions_0',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      section: 'laws',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
