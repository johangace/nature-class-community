import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { release, PROJECT, TEAM, HOSTS } from './production-release.mjs';
const candidate = 'a'.repeat(40), old = 'b'.repeat(40), head = 'c'.repeat(40);
function fixture(change = {}) {
  const calls = []; let promoted = false; let projectReads = 0;
  const project = () => ({ id: PROJECT, accountId: TEAM, autoAssignCustomDomains: false, protectionBypass: { 'test-only-bypass': { scope: 'automation-bypass' } }, targets: { production: { id: promoted ? 'dpl_new' : 'dpl_old', meta: { githubCommitSha: promoted ? candidate : old } } } });
  const evidence = (id, data, author) => ({ body: '```release-evidence\n' + JSON.stringify({ repo: 'johangace/nature-class', pr: 1174, ...data }) + '\n```', user: { login: author }, issue_url: 'https://api.github.com/repos/johangace/nature-class/issues/1174', html_url: `https://github.com/johangace/nature-class/pull/1174#issuecomment-${id}` });
  const review = evidence(1, { kind: 'review', candidateSha: candidate, reviewedHeadSha: head, result: 'pass', mode: 'independent-review', reviewer: 'reviewer' }, 'reviewer');
  const smoke = evidence(2, { kind: 'feature-smoke', candidateSha: candidate, deploymentId: 'dpl_new', result: 'pass', scope: 'PR#1174', readOnly: true, testedBy: 'tester', checks: [{ name: 'observation fallback', result: 'pass' }] }, 'tester');
  const ref = e => ({ url: e.html_url, sha256: createHash('sha256').update(e.body).digest('hex') });
  const args = { candidate, deploymentId: 'dpl_new', reviewReference: ref(review), smokeReference: ref(smoke), sleep: async () => {},
    gh: async path => {
      if (path === '/issues/comments/1') return review;
      if (path === '/issues/comments/2') return smoke;
      if (path === '/branches/main') return { commit: { sha: candidate } };
      if (path.startsWith('/compare/')) return { status: 'ahead' };
      if (path.includes('check-runs')) return { total_count: 3, check_runs: ['build', 'mergeable', 'identity'].map(name => ({ name, status: 'completed', conclusion: 'success' })) };
      if (path.includes('/commits/')) return [{ number: 1174, merged_at: 'today', merge_commit_sha: candidate, base: { ref: 'main', repo: { full_name: 'johangace/nature-class' } }, head: { sha: head }, user: { login: 'author' } }];
      throw Error(`unexpected GitHub request ${path}`);
    },
    vc: async (path, method = 'GET') => {
      calls.push({ path, method });
      if (method === 'POST') { promoted = true; return {}; }
      if (path.startsWith('/v4/aliases/')) { const id = promoted ? 'dpl_new' : 'dpl_old'; return { deploymentId: id, deployment: { id } }; }
      if (path === '/v13/deployments/dpl_old') return { id: 'dpl_old', projectId: PROJECT, ownerId: TEAM, target: 'production', readyState: 'READY', readySubstate: 'PROMOTED', meta: { githubCommitSha: old }, url: 'old.vercel.app' };
      if (path === '/v13/deployments/dpl_new') return { id: 'dpl_new', projectId: PROJECT, ownerId: TEAM, target: 'production', readyState: 'READY', readySubstate: 'STAGED', meta: { githubCommitSha: candidate }, url: 'candidate.vercel.app' };
      projectReads++;
      return project();
    },
    health: async host => ({ env: 'production', sha: host === 'candidate.vercel.app' || promoted ? candidate : old, deployment: host === 'candidate.vercel.app' || promoted ? 'dpl_new' : 'dpl_old' }),
  };
  for (const [key, transform] of Object.entries(change)) {
    const original = args[key];
    args[key] = (...input) => {
      if (key === 'vc' && input.length === 1) input.push('GET');
      return transform(original, ...input, { projectReads });
    };
  }
  return { args, calls, review, smoke, ref };
}
test('promotes exactly the tested artifact and verifies both public hosts', async () => {
  const { args, calls } = fixture(); const result = await release(args);
  assert.deepEqual(calls.filter(c => c.method === 'POST'), [{ path: `/v10/projects/${PROJECT}/promote/dpl_new`, method: 'POST' }]);
  assert.deepEqual(result.after.map(r => r.host), HOSTS);
  assert.equal(result.stage.deployment, 'dpl_new');
});
const cases = [
  ['missing check', { gh: async (original, path) => path.includes('check-runs') ? { total_count: 0, check_runs: [] } : original(path) }, /required check/],
  ['failed exact head', { gh: async (original, path) => path.includes(head) && path.includes('check-runs') ? { total_count: 1, check_runs: [{ name: 'build', status: 'completed', conclusion: 'failure' }] } : original(path) }, /required check/],
  ['missing identity', { gh: async (original, path) => { const result = await original(path); return path.includes(head) && path.includes('check-runs') ? { ...result, check_runs: result.check_runs.filter(c => c.name !== 'identity') } : result; } }, /required check identity/],
  ['red identity', { gh: async (original, path) => { const result = await original(path); return path.includes(head) && path.includes('check-runs') ? { ...result, check_runs: result.check_runs.map(c => c.name === 'identity' ? { ...c, conclusion: 'failure' } : c) } : result; } }, /required check identity/],
  ['older candidate', { gh: async (original, path) => path.includes(`/compare/${old}`) ? { status: 'behind' } : original(path) }, /older/],
  ['unmerged candidate', { gh: async (original, path) => path.includes('/pulls?') ? [] : original(path) }, /merged main PR/],
  ['automatic assignment', { vc: async (original, path, method) => ({ ...await original(path, method), autoAssignCustomDomains: true }) }, /assignment must be disabled/],
  ['missing protection credential', { vc: async (original, path, method) => ({ ...await original(path, method), protectionBypass: {} }) }, /protection credential must be provisioned/],
  ['wrong artifact SHA', { vc: async (original, path, method) => { const p = await original(path, method); return path === '/v13/deployments/dpl_new' ? { ...p, meta: { githubCommitSha: old } } : p; } }, /SHA mismatch/],
  ['wrong project', { vc: async (original, path, method) => { const p = await original(path, method); return path === '/v13/deployments/dpl_new' ? { ...p, projectId: 'wrong' } : p; } }, /project\/team mismatch/],
  ['preview artifact', { vc: async (original, path, method) => { const p = await original(path, method); return path === '/v13/deployments/dpl_new' ? { ...p, target: 'preview' } : p; } }, /READY production/],
  ['health mismatch', { health: async () => ({ env: 'production', sha: old, deployment: 'dpl_wrong' }) }, /health identity/],
  ['stage health mismatch', { health: async (original, host) => host === 'candidate.vercel.app' ? { env: 'preview', sha: candidate, deployment: 'dpl_new' } : original(host) }, /health identity/],
  ['concurrent production change', { vc: async (original, path, method, state) => { const p = await original(path, method); return path.startsWith('/v4/aliases/') && state.projectReads > 1 ? { deploymentId: 'dpl_other', deployment: { id: 'dpl_other' } } : p; } }, /production changed/],
];
for (const [name, changes, error] of cases) test(`refuses ${name} before promotion`, async () => {
  const { args, calls } = fixture(changes);
  await assert.rejects(release(args), error);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});
test('post-promotion health failure never repeats the mutation', async () => {
  let reads = 0;
  const { args, calls } = fixture({ health: async (original, host) => { reads++; return reads > 3 ? { env: 'production', sha: old, deployment: 'dpl_old' } : original(host); } });
  await assert.rejects(release(args), /health identity/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});

const replaceEvidence = (f, key, update) => {
  const value = f[key];
  const data = JSON.parse(value.body.split('\n')[1]);
  update(data, value);
  value.body = '```release-evidence\n' + JSON.stringify(data) + '\n```';
  f.args[key === 'review' ? 'reviewReference' : 'smokeReference'] = f.ref(value);
};
for (const [name, update, pattern] of [
  ['stale review SHA', f => replaceEvidence(f, 'review', d => { d.reviewedHeadSha = old; }), /SHA\/result/],
  ['self-review', f => replaceEvidence(f, 'review', d => { d.reviewer = 'author'; }), /independent reviewer/],
  ['arbitrary receipt URL', f => { f.args.reviewReference.url = 'https://example.com/receipt'; }, /repo and PR/],
  ['wrong PR receipt', f => { f.args.reviewReference.url = f.args.reviewReference.url.replace('/1174#', '/100#'); }, /repo and PR/],
  ['edited receipt', f => { f.review.body += 'edited'; }, /body changed/],
  ['wrong smoke artifact', f => replaceEvidence(f, 'smoke', d => { d.deploymentId = 'dpl_other'; }), /smoke identity/],
  ['wrong smoke SHA', f => replaceEvidence(f, 'smoke', d => { d.candidateSha = old; }), /smoke identity/],
  ['missing feature checks', f => replaceEvidence(f, 'smoke', d => { d.checks = []; }), /checks missing/],
  ['incomplete fallback', f => replaceEvidence(f, 'review', d => { d.mode = 'review-credit-fallback'; }), /fallback policy/],
]) test(`refuses ${name} before promotion`, async () => {
  const f = fixture(); update(f);
  await assert.rejects(release(f.args), pattern);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});
test('accepts documented exhausted-review fallback without formal APPROVED event', async () => {
  const f = fixture();
  replaceEvidence(f, 'review', d => Object.assign(d, { mode: 'review-credit-fallback', policy: 'https://github.com/Wyld-Way/wyldway-office/blob/main/rules/TEAM_RULES.md#review-credits-run-out-the-other-reviewer-finishes-then-copilot-if-free-then-push', twoWayDoor: true, highBlastRadius: false, exhausted: ['claude', 'codex'], copilot: 'not-free', lastReviewedCommit: head, remainingDiffReadBy: 'reviewer' }));
  await release(f.args);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('passes the protection credential only to the immutable artifact and never into receipts', async () => {
  const seen = [];
  const { args } = fixture({ health: async (original, host, bypass) => { seen.push({ host, bypass }); return original(host); } });
  const receipt = await release(args);
  assert.deepEqual(seen.filter(c => c.bypass), [{ host: 'candidate.vercel.app', bypass: 'test-only-bypass' }]);
  assert.equal(JSON.stringify(receipt).includes('test-only-bypass'), false);
});

test('uses actual serving aliases when project production target is a different staged build', async () => {
  const comparisons = [];
  const stagedSha = 'd'.repeat(40);
  const { args, calls } = fixture({
    vc: async (original, path, method) => {
      const p = await original(path, method);
      return path.startsWith('/v9/') ? { ...p, targets: { production: { id: 'dpl_staged', readySubstate: 'STAGED', meta: { githubCommitSha: stagedSha } } } } : p;
    },
    gh: async (original, path) => { if (path.startsWith('/compare/')) comparisons.push(path); return original(path); },
  });
  const receipt = await release(args);
  assert.equal(receipt.previousDeploymentId, 'dpl_old');
  assert.equal(receipt.previousSha, old);
  assert.equal(comparisons.includes(`/compare/${old}...${candidate}`), true);
  assert.equal(comparisons.some(p => p.includes(stagedSha)), false);
  assert.equal(calls.some(c => c.path.includes('dpl_staged')), false);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});

test('refuses initially disagreeing public aliases without promotion', async () => {
  const { args, calls } = fixture({ vc: async (original, path, method) => {
    if (path === `/v4/aliases/${HOSTS[1]}`) return { deploymentId: 'dpl_other', deployment: { id: 'dpl_other' } };
    return original(path, method);
  } });
  await assert.rejects(release(args), /aliases disagree/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});

test('refuses one alias changing during validation without promotion', async () => {
  const { args, calls } = fixture({ vc: async (original, path, method, state) => {
    const p = await original(path, method);
    return state.projectReads > 1 && path === `/v4/aliases/${HOSTS[1]}` ? { deploymentId: 'dpl_new', deployment: { id: 'dpl_new' } } : p;
  } });
  await assert.rejects(release(args), /production changed/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});

test('waits through partial old/new alias propagation and verifies both new aliases', async () => {
  let delayed = false, waits = 0;
  const { args, calls } = fixture({ vc: async (original, path, method) => {
    const p = await original(path, method);
    if (path === `/v4/aliases/${HOSTS[1]}` && p.deploymentId === 'dpl_new' && !delayed) {
      delayed = true;
      return { deploymentId: 'dpl_old', deployment: { id: 'dpl_old' } };
    }
    return p;
  } });
  args.sleep = async () => { waits++; };
  const receipt = await release(args);
  assert.equal(waits, 1);
  assert.deepEqual(receipt.afterAliases, HOSTS.map(host => ({ host, deploymentId: 'dpl_new' })));
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});

test('rejects a third deployment during propagation without promoting again', async () => {
  const { args, calls } = fixture({ vc: async (original, path, method) => {
    const p = await original(path, method);
    return path === `/v4/aliases/${HOSTS[1]}` && p.deploymentId === 'dpl_new' ? { deploymentId: 'dpl_other', deployment: { id: 'dpl_other' } } : p;
  } });
  await assert.rejects(release(args), /another deployment became production/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
});

test('refuses an alias serving a deployment from another project', async () => {
  const { args, calls } = fixture({ vc: async (original, path, method) => {
    const p = await original(path, method);
    return path === '/v13/deployments/dpl_old' ? { ...p, projectId: 'prj_other' } : p;
  } });
  await assert.rejects(release(args), /serving deployment project\/team mismatch/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});

test('refuses an artifact owned by a different team using the live ownerId field', async () => {
  const { args, calls } = fixture({ vc: async (original, path, method) => {
    const value = await original(path, method);
    return path === '/v13/deployments/dpl_new' ? { ...value, ownerId: 'team_other' } : value;
  } });
  await assert.rejects(release(args), /artifact project\/team mismatch/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});
