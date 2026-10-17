import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTEST_PLACEMENTS,
  CONTEST_ROLES,
  contestCoverUrl,
  contestSlug,
  contestState,
  normalizeContestEligibility,
  serializeSubmission,
} from '../lib/contests.js';

test('contest roles and first-release placements stay bounded', () => {
  assert.deepEqual([...CONTEST_ROLES], ['moderator', 'judge']);
  assert.deepEqual([...CONTEST_PLACEMENTS], ['winner', 'runner-up', 'honorable-mention']);
});

test('contest state advances from immutable deadlines', () => {
  const contest = { status: 'scheduled', starts_at: 100, submissions_close_at: 200, judging_closes_at: 300, results_at: null };
  assert.equal(contestState(contest, 50), 'scheduled');
  assert.equal(contestState(contest, 150), 'live');
  assert.equal(contestState(contest, 250), 'judging');
  assert.equal(contestState({ ...contest, status: 'completed', results_at: 280 }, 400), 'completed');
  assert.equal(contestState({ ...contest, status: 'cancelled' }, 150), 'cancelled');
});

test('contest slugs and frozen submission metadata are stable', () => {
  assert.equal(contestSlug(' Open Web Challenge! '), 'open-web-challenge');
  const submission = serializeSubmission({
    id: 'submission-1', contest_id: 'contest-1', blog_id: 'blog-1', author_id: 'user-1',
    author_username: 'writer', snapshot_content: JSON.stringify([{ id: 'block-1' }]),
    snapshot_metadata: JSON.stringify({ title: 'Frozen title', tags: ['web'], license: 'cc-by-4.0' }),
  }, { includeSnapshot: true });
  assert.equal(submission.title, 'Frozen title');
  assert.deepEqual(submission.tags, ['web']);
  assert.deepEqual(submission.snapshot.content, [{ id: 'block-1' }]);
});

test('contest covers require absolute credential-free HTTPS URLs', () => {
  assert.equal(contestCoverUrl('https://images.example.com/cover.webp'), 'https://images.example.com/cover.webp');
  assert.throws(() => contestCoverUrl('http://images.example.com/cover.webp'), /invalid_cover_url/);
  assert.throws(() => contestCoverUrl('https://user:secret@images.example.com/cover.webp'), /invalid_cover_url/);
  assert.throws(() => contestCoverUrl('/relative-cover.webp'), /invalid_cover_url/);
});

test('contest eligibility stores whole non-negative account months', () => {
  assert.deepEqual(normalizeContestEligibility({ minimumAccountAgeMonths: 2.8, requireBio: true }), {
    minimumAccountAgeMonths: 2,
    requireBio: true,
  });
  assert.equal(normalizeContestEligibility({ minimumAccountAgeMonths: -4 }).minimumAccountAgeMonths, 0);
});
