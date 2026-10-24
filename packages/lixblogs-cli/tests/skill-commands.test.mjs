import test from 'node:test';
import assert from 'node:assert/strict';
import { skillInspect, skillInstall, skillInstallAll, skillList } from '../src/commands/skill/index.js';

test('bundled skills are individually discoverable', async () => {
  const skills = await skillList();
  assert.deepEqual(skills.map((skill) => skill.name), [
    'lixblogs-analytics',
    'lixblogs-author',
    'lixblogs-editorial',
    'lixblogs-media',
    'lixblogs-organizations',
    'lixblogs-publish',
  ]);
  assert.equal(skills.find((skill) => skill.name === 'lixblogs-analytics').minimumCliVersion, '1.3.0');
  assert.equal(skills.find((skill) => skill.name === 'lixblogs-author').minimumCliVersion, '1.5.8');
  assert.equal(skills.find((skill) => skill.name === 'lixblogs-media').minimumCliVersion, '1.5.0');
  assert.ok(skills.filter((skill) => !['lixblogs-analytics', 'lixblogs-author', 'lixblogs-media'].includes(skill.name)).every((skill) => skill.minimumCliVersion === '1.2.0'));
});

test('skill inspection returns the exact agent instruction', async () => {
  const skill = await skillInspect({ name: 'lixblogs-author' });
  assert.match(skill.content, /^---\nname: lixblogs-author/m);
  assert.match(skill.content, /--json --no-input/);
});

test('skill installation supports a non-writing dry run', async () => {
  const result = await skillInstall({
    name: 'lixblogs-publish',
    options: { target: '.test-agent-skills', 'dry-run': true },
  });
  assert.equal(result.dryRun, true);
  assert.match(result.target, /\.test-agent-skills\/lixblogs-publish$/);
});

test('all bundled skills can be planned for a fresh agent workspace', async () => {
  const result = await skillInstallAll({
    options: { target: '.test-agent-skills', 'dry-run': true },
  });
  assert.equal(result.all, true);
  assert.equal(result.skills.length, 6);
  assert.ok(result.skills.every(({ target }) => target.includes('.test-agent-skills/lixblogs-')));
});
