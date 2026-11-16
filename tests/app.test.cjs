const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const hosts = JSON.parse(fs.readFileSync(path.join(root, 'hosts.json'), 'utf8'));
const configurations = Object.fromEntries([...new Set(Object.values(hosts))].map(id => [id,
  JSON.parse(fs.readFileSync(path.join(root, 'sites', `${id}.json`), 'utf8'))]));
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

async function boot(address, { config, api } = {}) {
  const elements = [];
  const downloads = [];
  const requests = [];
  const revoked = [];
  const blobs = new Map();
  const windowEvents = {};
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.listeners = {};
      this.attributes = {};
      this.value = '';
      this.textContent = '';
      elements.push(this);
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; if (key === 'href') this.href = ''; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    reportValidity() { return true; }
    click() {
      if (this.tag === 'a' && this.download) downloads.push({filename: this.download, blob: blobs.get(this.href)});
      return this.listeners.click?.({});
    }
  }
  const ids = Object.fromEntries(['content', 'status', 'page-title'].map(id => [id, new Element('div')]));
  class BrowserURL extends URL {}
  BrowserURL.createObjectURL = blob => { const id = `blob:test-${blobs.size}`; blobs.set(id, blob); return id; };
  BrowserURL.revokeObjectURL = url => { revoked.push(url); blobs.delete(url); };
  const context = {
    document: { getElementById: id => ids[id], createElement: tag => new Element(tag) },
    window: { addEventListener: (type, callback) => { windowEvents[type] = callback; } },
    location: new URL(address), URL: BrowserURL, URLSearchParams, Blob, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({url, options});
      if (url === 'hosts.json') return {ok: true, json: async () => structuredClone(hosts)};
      if (url.startsWith('sites/')) {
        const id = url.slice(6, -5);
        return {ok: !!configurations[id] || !!config, json: async () => structuredClone(config || configurations[id])};
      }
      return api ? api(url, options) : {ok: true, json: async () => ({accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresAt: '2030-01-01'})};
    }
  };
  vm.runInNewContext(source, context);
  await settle();
  const input = name => elements.find(element => element.tag === 'input' && element.name === name);
  const form = elements.find(element => element.tag === 'form');
  return {
    elements, downloads, requests, revoked, blobs, ids, input,
    submit: () => form.listeners.submit({preventDefault() {}}),
    reset: () => elements.find(element => element.tag === 'button' && element.type === 'button').click(),
    pagehide: () => windowEvents.pagehide({}),
    pageshow: () => windowEvents.pageshow({persisted: true}),
    fill(values) { for (const [key, value] of Object.entries(values)) input(key).value = value; },
    assertClean() {
      assert.ok(elements.filter(element => element.tag === 'input').every(element => element.value === ''));
      assert.equal(blobs.size, 0);
    },
    assertNoRendered(secret) {
      assert.ok(elements.every(element => !element.textContent.includes(secret) && !JSON.stringify(element.attributes).includes(secret)));
    }
  };
}

test('root directory lists every site with both addresses', async () => {
  const app = await boot('https://pickle-loginbridge.pages.dev/');
  assert.equal(app.elements.filter(element => element.tag === 'a').length, 6);
  assert.equal(app.elements.filter(element => element.tag === 'input').length, 0);
});

test('mapped host takes priority over an attacker-supplied site query', async () => {
  const app = await boot('https://pickle-loginbridge--smartthings-pat.pages.dev/?site=knocktown-appapi');
  assert.ok(app.input('token'));
  assert.equal(app.input('username'), undefined);
});

test('local config download preserves escaped text and leading zeros, and releases secrets', async () => {
  const app = await boot('http://localhost:8000/?site=dongtan-lakecity-visit-web');
  const password = 'fake-"\\\n</script><img src=x>';
  app.fill({dong: '001', ho: '0203', password});
  await app.submit();
  assert.equal(app.downloads.length, 1);
  const serialized = await app.downloads[0].blob.text();
  assert.deepEqual(JSON.parse(serialized), {dong: '001', ho: '0203', password});
  assert.equal(serialized, JSON.stringify({dong: '001', ho: '0203', password}, null, 2));
  assert.equal(app.downloads[0].filename, 'dongtan_lakecity_visit_config.json');
  assert.equal(app.requests.length, 2);
  assert.equal(app.revoked.length, 1);
  app.assertClean();
  app.assertNoRendered(password);
});

test('token conversion uses masked accessible input and never sends the token', async () => {
  const app = await boot('https://preview.example.org/?site=smartthings-pat');
  assert.equal(app.input('token').type, 'password');
  assert.equal(app.input('token').autocomplete, 'current-password');
  assert.ok(app.elements.some(element => element.tag === 'label' && element.htmlFor === app.input('token').id));
  app.fill({token: 'fake-pat'});
  await app.submit();
  assert.deepEqual(JSON.parse(await app.downloads[0].blob.text()), {token: 'fake-pat'});
  assert.equal(app.requests.length, 2);
  app.assertClean();
  app.assertNoRendered('fake-pat');
});

test('download gate blocks both button and submit handler before authentication', async () => {
  const app = await boot('https://pickle-loginbridge--knocktown-appapi.pages.dev/');
  assert.equal(app.elements.find(element => element.type === 'submit').disabled, true);
  await app.submit();
  assert.equal(app.requests.length, 2);
  assert.equal(app.downloads.length, 0);
});

test('API POST uses the declared body and exports only selected response fields', async () => {
  const app = await boot('https://pickle-loginbridge--knocktown-appapi.pages.dev/?download=1');
  app.fill({username: 'fake-user', password: 'fake-password'});
  await app.submit();
  const request = app.requests[2];
  assert.deepEqual(JSON.parse(request.options.body), {username: 'fake-user', password: 'fake-password'});
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(await app.downloads[0].blob.text()), {accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresAt: '2030-01-01'});
  app.assertClean();
  app.assertNoRendered('fake-password');
  app.assertNoRendered('fake-access');
});

for (const [name, response] of [
  ['HTTP failure', {ok: false}],
  ['missing token', {ok: true, json: async () => ({accessToken: 'fake-access'})}],
  ['empty token', {ok: true, json: async () => ({accessToken: '', refreshToken: 'fake-refresh', expiresAt: 'date'})}],
  ['invalid response JSON', {ok: true, json: async () => { throw new SyntaxError('fake-sensitive-response'); }}]
]) {
  test(`${name} clears inputs without downloading or rendering server data`, async () => {
    const app = await boot('http://localhost/?site=knocktown-appapi&download=1', {api: async () => response});
    app.fill({username: 'fake-user', password: 'fake-password'});
    await app.submit();
    assert.equal(app.downloads.length, 0);
    assert.equal(app.ids.status.className, 'error');
    app.assertClean();
    app.assertNoRendered('fake-sensitive-response');
  });
}

test('duplicate submits and late results after reset cannot trigger downloads', async () => {
  let resolveRequest;
  const app = await boot('http://localhost/?site=knocktown-appapi&download=1', {
    api: () => new Promise(resolve => { resolveRequest = resolve; })
  });
  app.fill({username: 'fake-user', password: 'fake-password'});
  const pending = app.submit();
  await settle();
  await app.submit();
  assert.equal(app.requests.length, 3);
  app.reset();
  assert.equal(app.requests[2].options.signal.aborted, true);
  resolveRequest({ok: true, json: async () => ({accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresAt: 'date'})});
  await pending;
  assert.equal(app.downloads.length, 0);
  app.assertClean();
});

test('page departure and restored pages clear masked input', async () => {
  const app = await boot('http://localhost/?site=smartthings-pat');
  app.fill({token: 'fake-pat'});
  app.pagehide();
  app.assertClean();
  app.fill({token: 'fake-restored-pat'});
  app.pageshow();
  app.assertClean();
});

for (const [name, change] of [
  ['prototype key', config => { config.output = JSON.parse('{"__proto__":{"polluted":true}}'); }],
  ['unknown field', config => { config.output.token = {$field: 'missing'}; }],
  ['unmasked token', config => { config.fields[0].type = 'text'; }],
  ['script URL', config => { config.originLoginUrl = 'javascript:alert(1)'; }],
  ['path traversal filename', config => { config.filename = '../secret.json'; }],
  ['unknown executable property', config => { config.script = 'alert(1)'; }],
  ['duplicate inputs', config => { config.fields.push({...config.fields[0]}); }],
  ['response reference in local mode', config => { config.output.token = {$response: ['token']}; }]
]) {
  test(`invalid configuration rejects ${name}`, async () => {
    const config = structuredClone(configurations['smartthings-pat']);
    change(config);
    const app = await boot('http://localhost/?site=smartthings-pat', {config});
    assert.equal(app.elements.filter(element => element.tag === 'form').length, 0);
    assert.equal(app.ids.status.className, 'error');
  });
}

test('unsafe API endpoint is rejected before rendering credential fields', async () => {
  const config = structuredClone(configurations['knocktown-appapi']);
  config.api.url = 'http://example.org/login';
  const app = await boot('http://localhost/?site=knocktown-appapi&download=1', {config});
  assert.equal(app.input('password'), undefined);
});

test('unsafe transport and traversal site IDs are rejected', async () => {
  for (const address of ['http://192.168.1.2/?site=smartthings-pat', 'file:///index.html', 'https://preview.example.org/?site=../../secret']) {
    const app = await boot(address);
    assert.equal(app.input('token'), undefined);
    assert.equal(app.ids.status.className, 'error');
    assert.ok(app.requests.every(request => !request.url.includes('../')));
  }
});
