import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const PROJECT = 'prj_tKSpsDhO9QfYECdkR5xndW8eTJEf';
export const TEAM = 'team_2lbOO4gN5SHZX4ELCDT2rc7K';
export const HOSTS = ['natureclass.education', 'nature-class-iota.vercel.app'];
const REPO = 'johangace/nature-class';
const SHA = /^[a-f0-9]{40}$/;
const assert = (value, message) => { if (!value) throw new Error(message); };

// A GitHub comment URL is stable but editable. Pin its exact body SHA-256 as
// well, making the supplied evidence immutable for this run without pretending
// that GitHub comments themselves cannot change.
export async function readEvidence(reference, pr, gh) {
  assert(reference && /^[a-f0-9]{64}$/.test(reference.sha256), 'receipt body digest required');
  const match = /^https:\/\/github\.com\/johangace\/nature-class\/pull\/([0-9]+)#issuecomment-([0-9]+)$/.exec(reference.url);
  assert(match && Number(match[1]) === pr, 'receipt URL must belong to this repo and PR');
  const comment = await gh(`/issues/comments/${match[2]}`);
  assert(comment.issue_url === `https://api.github.com/repos/${REPO}/issues/${pr}` && comment.html_url === reference.url, 'receipt API association mismatch');
  assert(createHash('sha256').update(comment.body).digest('hex') === reference.sha256, 'receipt body changed');
  const block = /```release-evidence\n([\s\S]*?)\n```/.exec(comment.body);
  assert(block, 'structured release evidence missing; receipt adapter not installed');
  const data = JSON.parse(block[1]);
  assert(data.repo === REPO && data.pr === pr, 'receipt metadata repo/PR mismatch');
  return { data, author: comment.user.login, url: reference.url, sha256: reference.sha256 };
}

// All traffic-switching calls must use the workflow's ONE shared concurrency group.
// This script cannot lock out a separate CLI/dashboard operator.
export async function release({ candidate, deploymentId, reviewReference, smokeReference, gh, vc, health, sleep = ms => new Promise(r => setTimeout(r, ms)), receipt = {} }) {
  assert(SHA.test(candidate), 'candidate must be a full SHA');
  assert(/^dpl_[A-Za-z0-9]+$/.test(deploymentId), 'invalid deployment ID');
  Object.assign(receipt, { candidate, deploymentId, startedAt: new Date().toISOString() });
  const ancestor = async (base, head) => {
    assert(SHA.test(base), 'missing or invalid production SHA');
    const c = await gh(`/compare/${base}...${head}`);
    assert(['ahead', 'identical'].includes(c.status), 'candidate is older than or divergent from required base');
  };
  const checks = async (sha, required) => {
    const response = await gh(`/commits/${sha}/check-runs?per_page=100&filter=latest`);
    assert(response.total_count <= 100, 'check list truncated');
    for (const name of required) {
      const matches = response.check_runs.filter(c => c.name === name);
      assert(matches.length > 0 && matches.every(c => c.status === 'completed' && c.conclusion === 'success'), `required check ${name} failed or missing on ${sha}`);
    }
  };
  const main = await gh('/branches/main');
  await ancestor(candidate, main.commit.sha);
  await checks(candidate, ['build']);
  const prs = await gh(`/commits/${candidate}/pulls?per_page=100`);
  const merged = prs.filter(p => p.merged_at && p.base.ref === 'main' && p.base.repo.full_name === REPO && p.merge_commit_sha === candidate);
  assert(merged.length === 1, 'candidate must identify exactly one merged main PR');
  const pr = merged[0];
  await checks(pr.head.sha, ['build', 'mergeable', 'identity']);
  const review = await readEvidence(reviewReference, pr.number, gh);
  const r = review.data;
  assert(r.kind === 'review' && r.candidateSha === candidate && r.reviewedHeadSha === pr.head.sha && r.result === 'pass', 'review receipt SHA/result mismatch');
  if (r.mode === 'independent-review') {
    assert(typeof r.reviewer === 'string' && r.reviewer && r.reviewer !== pr.user.login, 'independent reviewer missing');
    assert(review.author === r.reviewer || review.author === 'johangace', 'review must be recorded by reviewer or Johan');
  } else {
    assert(r.mode === 'review-credit-fallback', 'unknown review evidence mode');
    assert(r.policy === 'https://github.com/Wyld-Way/wyldway-office/blob/main/rules/TEAM_RULES.md#review-credits-run-out-the-other-reviewer-finishes-then-copilot-if-free-then-push' && r.twoWayDoor === true && r.highBlastRadius === false, 'fallback policy/scope missing');
    assert(r.exhausted?.includes('claude') && r.exhausted?.includes('codex') && ['exhausted', 'not-free'].includes(r.copilot), 'fallback exhaustion evidence incomplete');
    assert(SHA.test(r.lastReviewedCommit) && typeof r.remainingDiffReadBy === 'string' && r.remainingDiffReadBy, 'fallback remaining-review record missing');
    assert(review.author === r.remainingDiffReadBy || review.author === 'johangace', 'fallback must be recorded by remaining reviewer or Johan');
  }
  receipt.reviewEvidence = review;
  const smoke = await readEvidence(smokeReference, pr.number, gh);
  assert(smoke.data.kind === 'feature-smoke' && smoke.data.candidateSha === candidate && smoke.data.deploymentId === deploymentId && smoke.data.result === 'pass', 'feature smoke identity/result mismatch');
  assert((smoke.data.scope === `PR#${pr.number}` || (pr.number === 1174 && smoke.data.scope === 'NC#621')) && smoke.data.readOnly === true && Array.isArray(smoke.data.checks) && smoke.data.checks.length > 0 && smoke.data.checks.every(c => c.name && c.result === 'pass'), 'feature smoke checks missing');
  assert(smoke.author === smoke.data.testedBy, 'feature smoke recorder mismatch');
  receipt.featureSmokeEvidence = smoke;
  receipt.pr = pr.number;
  receipt.reviewedHead = pr.head.sha;
  const project = await vc(`/v9/projects/${PROJECT}`);
  assert(project.autoAssignCustomDomains === false, 'automatic production assignment must be disabled');
  assert(project.id === PROJECT && project.accountId === TEAM, 'wrong project or team');
  const protectionBypass = Object.entries(project.protectionBypass ?? {}).find(([, metadata]) => metadata.scope === 'automation-bypass')?.[0];
  assert(protectionBypass, 'project automation protection credential must be provisioned before release');
  // targets.production can be the latest STAGED build. Only the public aliases
  // identify the deployment actually receiving production traffic.
  const servingAliases = async () => Promise.all(HOSTS.map(async host => {
    const alias = await vc(`/v4/aliases/${host}`);
    const id = alias.deploymentId ?? alias.deployment?.id;
    assert(/^dpl_[A-Za-z0-9]+$/.test(id), `missing serving deployment: ${host}`);
    assert(!alias.deployment?.id || alias.deployment.id === id, `alias deployment identity mismatch: ${host}`);
    return { host, deploymentId: id };
  }));
  const initialAliases = await servingAliases();
  const servingId = initialAliases[0].deploymentId;
  assert(initialAliases.every(a => a.deploymentId === servingId), 'public production aliases disagree');
  const current = await vc(`/v13/deployments/${servingId}`);
  assert(current.id === servingId && current.projectId === PROJECT && current.ownerId === TEAM, 'serving deployment project/team mismatch');
  assert(current.target === 'production' && current.readyState === 'READY', 'serving deployment must be READY production');
  receipt.beforeAliases = initialAliases;
  receipt.previousDeploymentId = current.id;
  receipt.previousSha = current.meta?.githubCommitSha;
  await ancestor(receipt.previousSha, candidate);
  const artifact = await vc(`/v13/deployments/${deploymentId}`);
  assert(artifact.projectId === PROJECT && artifact.ownerId === TEAM, 'artifact project/team mismatch');
  assert(artifact.target === 'production' && artifact.readyState === 'READY', 'artifact must be READY production');
  assert(artifact.meta?.githubCommitSha === candidate, 'artifact SHA mismatch');
  assert(artifact.readySubstate === 'STAGED' || current.id === deploymentId, 'artifact is not staged');
  assert(/^[a-zA-Z0-9-]+\.vercel\.app$/.test(artifact.url), 'unexpected artifact hostname');
  const expectHealth = async (host, sha, id, bypass = undefined) => {
    const body = await health(host, bypass);
    assert(body.env === 'production' && body.sha === sha && body.deployment === id, `health identity mismatch: ${host}`);
    return { host, ...body };
  };
  receipt.before = [];
  for (const host of HOSTS) receipt.before.push(await expectHealth(host, receipt.previousSha, current.id));
  receipt.stage = await expectHealth(artifact.url, candidate, deploymentId, protectionBypass);
  // Recheck immediately before mutation, while still holding workflow lock.
  const fresh = await vc(`/v9/projects/${PROJECT}`);
  assert(fresh.autoAssignCustomDomains === false, 'automatic assignment re-enabled');
  const freshAliases = await servingAliases();
  assert(freshAliases.every(a => a.deploymentId === current.id), 'production changed during validation');
  receipt.beforePromotionAliases = freshAliases;
  await ancestor(current.meta?.githubCommitSha, candidate);
  if (current.id !== deploymentId) {
    receipt.promotionRequestedAt = new Date().toISOString();
    await vc(`/v10/projects/${PROJECT}/promote/${deploymentId}`, 'POST');
  }
  // Promotion is async. A different newer ID is a conflict, never permission
  // to retry promotion and overwrite it. Postcheck retries do not mutate.
  for (let attempt = 0; attempt < 30; attempt++) {
    const aliases = await servingAliases();
    assert(aliases.every(a => a.deploymentId === current.id || a.deploymentId === deploymentId), 'another deployment became production');
    // Alias propagation can temporarily split old/new. Neither a staged project
    // target nor just one updated alias means the release is fully serving.
    if (aliases.every(a => a.deploymentId === deploymentId)) {
      try {
        receipt.after = [];
        for (const host of HOSTS) receipt.after.push(await expectHealth(host, candidate, deploymentId));
        receipt.afterAliases = aliases;
        receipt.completedAt = new Date().toISOString();
        return receipt;
      } catch (e) { if (attempt === 29) throw e; }
    }
    await sleep(2000);
  }
  throw new Error('promotion did not verify; inspect production before any recovery');
}

async function main() {
  const { CANDIDATE_SHA: candidate, DEPLOYMENT_ID: deploymentId, GITHUB_TOKEN, VERCEL_TOKEN, REVIEW_RECEIPT_URL, REVIEW_RECEIPT_SHA256, SMOKE_RECEIPT_URL, SMOKE_RECEIPT_SHA256 } = process.env;
  assert(GITHUB_TOKEN && VERCEL_TOKEN, 'dedicated GitHub/Vercel credentials required');
  const json = async (url, options = {}) => {
    const r = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
    assert(r.ok, `HTTP ${r.status} from ${new URL(url).hostname}`);
    if (r.status === 204) return {};
    const text = await r.text();
    return text ? JSON.parse(text) : {};
  };
  const receipt = {};
  try {
    await release({ candidate, deploymentId, receipt,
      reviewReference: { url: REVIEW_RECEIPT_URL, sha256: REVIEW_RECEIPT_SHA256 },
      smokeReference: { url: SMOKE_RECEIPT_URL, sha256: SMOKE_RECEIPT_SHA256 },
      gh: path => json(`https://api.github.com/repos/${REPO}${path}`, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }),
      vc: (path, method = 'GET') => json(`https://api.vercel.com${path}?teamId=${TEAM}`, { method, headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }),
      // Read the already-provisioned project credential. Never create credentials
      // during release; never follow redirects or include credential values in receipts.
      health: (host, bypass) => json(`https://${host}/api/health`, bypass ? { headers: { 'x-vercel-protection-bypass': bypass } } : {}),
    });
  } catch (e) { receipt.error = e.message; throw e; }
  finally { await writeFile('production-release-receipt.json', JSON.stringify(receipt, null, 2)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
