const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = require('../scripts/files.cjs');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-audio-security-'));
  t.after(() => {
    assert.equal(path.dirname(temp), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('browser-audio-security-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const repo = path.join(temp, 'repo');
  for (const file of [...files, 'package.json', ...fs.readdirSync(path.join(root, 'scripts')).map(name => 'scripts/' + name)]) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(repo, file));
  }
  return { temp, repo, run: () => spawnSync(process.execPath, ['scripts/build.cjs'], { cwd: repo, encoding: 'utf8' }) };
}

test('build rejects a dist directory junction without touching its target', t => {
  const f = fixture(t);
  const outside = path.join(f.temp, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'manifest.json'), 'sentinel');
  fs.symlinkSync(outside, path.join(f.repo, 'dist'), 'junction');
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(path.join(outside, 'manifest.json'), 'utf8'), 'sentinel');
});

test('build rejects source parent junctions', t => {
  const f = fixture(t);
  fs.renameSync(path.join(f.repo, 'icons'), path.join(f.temp, 'external-icons'));
  fs.symlinkSync(path.join(f.temp, 'external-icons'), path.join(f.repo, 'icons'), 'junction');
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.existsSync(path.join(f.repo, 'dist')), false, 'preflight before any output');
});

test('build rejects destination hardlinks without overwriting the target', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.repo, 'dist'));
  const sentinel = path.join(f.temp, 'sentinel'); fs.writeFileSync(sentinel, 'unchanged');
  fs.linkSync(sentinel, path.join(f.repo, 'dist', 'manifest.json'));
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'unchanged');
});

test('build rejects unexpected empty directories in release output', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.repo, 'dist', 'unreviewed'), { recursive: true });
  assert.notEqual(f.run().status, 0);
});

test('clean and repeated builds succeed', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0); assert.equal(f.run().status, 0);
  for (const file of files) assert.deepEqual(fs.readFileSync(path.join(f.repo, 'dist', file)), fs.readFileSync(path.join(f.repo, file)));
});

test('incomplete and malformed page diagnostics cannot report success', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'page-status.js'), 'utf8'), context);
  context.version = require('../manifest.json').version;
  for (const fields of [{ live: 1 }, { available: true, hooked: true, live: 1, processing: -1, unknown: 0, muted: 0, pending: 0, error: null }]) {
    context.result = { version: context.version, ...fields };
    assert.notEqual(vm.runInContext('summarizeFrames([{ result }], true, version).code', context), 'verified');
  }
});

test('ZIP whitelist checks directory entries as well as files', () => {
  const { validateArchiveNames } = require('../scripts/package-safety.cjs');
  assert.doesNotThrow(() => validateArchiveNames([...files, 'icons/']));
  for (const entry of ['../', '/absolute/', 'extra/', 'icons/../../', 'icons\\'])
    assert.throws(() => validateArchiveNames([...files, entry]));
  assert.throws(() => validateArchiveNames([...files, 'icons/', 'icons/']));
});

test('page inspection timeout releases the command queue', async () => {
  let cleared = false;
  const context = vm.createContext({
    chrome: { scripting: { executeScript: () => new Promise(() => {}) } },
    setTimeout: callback => { queueMicrotask(callback); return 42; },
    clearTimeout: id => { cleared = id === 42; }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'page-status.js'), 'utf8'), context);
  assert.equal((await vm.runInContext('inspectTab(1, true)', context)).code, 'restricted');
  assert.ok(cleared);
});

test('release runs reviewed local tools and checkout does not persist credentials', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  const uses = [...workflow.matchAll(/^\s+uses:\s+(\S+)/gm)].map(match => match[1]);
  assert.deepEqual(uses, ['./release-tools/attest', './release-tools/release']);
  assert.match(workflow, /git.*fetch --no-tags --depth=1 origin "\$GITHUB_SHA"/);
  assert.match(workflow, /unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 CHECKOUT_TOKEN/);
  assert.match(workflow, /node release-tools\/verify.cjs/);
  assert.match(workflow, /npm audit --prefix release-tools\/attest --audit-level=low/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test('page diagnostic projection does not adopt a hostile thenable', async () => {
  let adopted = false;
  const inspect = () => ({ then() { adopted = true; }, version: require('../manifest.json').version, secret: 'do-not-return' });
  const context = vm.createContext({
    Symbol, setTimeout, clearTimeout,
    chrome: { runtime: { getManifest: () => require('../manifest.json') }, scripting: {
      executeScript: async options => [{ result: await options.func() }]
    } }
  });
  context[Symbol.for('byUSXiaoxu.audioCompat.diagnostic')] = inspect;
  vm.runInContext(fs.readFileSync(path.join(root, 'page-status.js'), 'utf8'), context);
  assert.notEqual((await vm.runInContext('inspectTab(1, true)', context)).code, 'verified');
  assert.equal(adopted, false);
});
