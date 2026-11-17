import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByRelationship, type LedGroupSummary } from './my-groups.js';

function group(overrides: Partial<LedGroupSummary>): LedGroupSummary {
  return {
    id: 'g',
    courseId: 'c1',
    courseCode: 'CSE 3311',
    courseTitle: 'Object Oriented Software Engineering',
    name: 'Pattern crew',
    goal: 'Review design patterns',
    meetingDay: 'Tuesday',
    meetingTime: '14:30',
    format: 'in_person',
    location: 'Library',
    maxMembers: 6,
    memberCount: 2,
    viewerRole: 'none',
    viewerRequestStatus: null,
    pendingRequestCount: 0,
    ...overrides,
  };
}

test('groups the viewer leads keep their pending-request counts', () => {
  const { leading, member, requested } = groupByRelationship([
    group({ id: 'busy', viewerRole: 'leader', pendingRequestCount: 2 }),
    group({ id: 'quiet', viewerRole: 'leader', pendingRequestCount: 0 }),
  ]);
  assert.deepEqual(
    leading.map(({ id, pendingRequestCount }) => ({ id, pendingRequestCount })),
    [
      { id: 'busy', pendingRequestCount: 2 },
      { id: 'quiet', pendingRequestCount: 0 },
    ],
  );
  assert.equal(member.length, 0);
  assert.equal(requested.length, 0);
});

test('a group the viewer was approved into is listed once, as a membership, without a count', () => {
  const { leading, member, requested } = groupByRelationship([group({ id: 'joined', viewerRole: 'member' })]);
  assert.deepEqual(member.map(({ id }) => id), ['joined']);
  assert.equal('pendingRequestCount' in member[0]!, false);
  assert.equal(leading.length, 0);
  assert.equal(requested.length, 0);
});

test('pending and declined requests are listed as requests, with their status', () => {
  const { requested, member } = groupByRelationship([
    group({ id: 'waiting', viewerRequestStatus: 'pending' }),
    group({ id: 'turned-down', viewerRequestStatus: 'declined' }),
  ]);
  assert.deepEqual(
    requested.map(({ id, viewerRequestStatus }) => ({ id, viewerRequestStatus })),
    [
      { id: 'waiting', viewerRequestStatus: 'pending' },
      { id: 'turned-down', viewerRequestStatus: 'declined' },
    ],
  );
  assert.equal(member.length, 0);
});

test('a group the viewer has no tie to is left out', () => {
  const myGroups = groupByRelationship([group({ id: 'stranger' })]);
  assert.deepEqual(myGroups, { leading: [], member: [], requested: [] });
});
