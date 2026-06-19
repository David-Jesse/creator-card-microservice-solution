/* eslint-disable no-console, global-require, no-promise-executor-return, no-await-in-loop, no-nested-ternary, prefer-destructuring */
/* End-to-end HTTP test against the real Express server (in-memory repo). */
process.env.PORT = process.env.PORT || '8899';
process.env.PINO_LOG_LEVEL = 'silent';
delete process.env.MONGODB_URI; // -> mongoose createConnection no-ops
delete process.env.REDIS_URL; // -> queue no-ops

const http = require('http');
const makeRepoStub = require('./helpers/in-memory-repo');

// Inject in-memory repository before app/services load it.
const repoPath = require.resolve('@app/repository/creator-card');
require.cache[repoPath] = {
  id: repoPath,
  filename: repoPath,
  loaded: true,
  exports: makeRepoStub(),
};

const { PORT } = process.env;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    failures.push(`${label} :: ${detail}`);
    console.log(`  FAIL  ${label} -> ${detail}`);
  }
}

function request(method, path, body, rawBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const payload = typeof rawBody === 'string' ? rawBody : body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(retries = 40) {
  for (let i = 0; i < retries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await request('GET', '/creator-cards/__ping__');
      return true;
    } catch {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return false;
}

(async () => {
  // Start the real server.
  require('../app');

  const up = await waitForServer();
  if (!up) {
    console.log('SERVER DID NOT START');
    process.exit(1);
  }

  // 1. Create (full) -> 200 success envelope, id not _id
  let r = await request('POST', '/creator-cards', {
    title: 'George Cooks',
    description: 'Weekly cooking podcast',
    slug: 'george-cooks',
    creator_reference: 'crt_8f2k1m9x4p7w3q5z',
    links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
    service_rates: {
      currency: 'NGN',
      rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
    },
    status: 'published',
  });
  check(
    r.status === 200 &&
      r.body.status === 'success' &&
      r.body.message === 'Creator Card Created Successfully.' &&
      r.body.data &&
      r.body.data.id &&
      !('_id' in r.body.data) &&
      r.body.data.access_type === 'public' &&
      r.body.data.access_code === null,
    'POST create -> 200 success envelope, id (not _id), access_code null',
    JSON.stringify(r)
  );

  // 2. GET public published -> 200, no access_code
  r = await request('GET', '/creator-cards/george-cooks');
  check(
    r.status === 200 &&
      r.body.status === 'success' &&
      r.body.data.id &&
      !('access_code' in r.body.data),
    'GET public -> 200, access_code omitted',
    JSON.stringify(r)
  );

  // 3. Duplicate slug -> 400 SL02 with top-level code
  r = await request('POST', '/creator-cards', {
    title: 'Another George',
    slug: 'george-cooks',
    creator_reference: 'crt_m1n2b3v4c5x6z7l8',
    status: 'published',
  });
  check(
    r.status === 400 && r.body.status === 'error' && r.body.code === 'SL02',
    'POST duplicate slug -> 400 + code SL02',
    JSON.stringify(r)
  );

  // 4. Framework validation (bad enum) -> 400
  r = await request('POST', '/creator-cards', {
    title: 'Bad Status Card',
    creator_reference: 'crt_q1w2e3r4t5y6u7i8',
    status: 'archived',
  });
  check(
    r.status === 400 && r.body.status === 'error',
    'POST bad status enum -> 400 (framework validation)',
    JSON.stringify(r)
  );

  // 5. GET non-existent -> 404 NF01
  r = await request('GET', '/creator-cards/does-not-exist-123');
  check(
    r.status === 404 && r.body.code === 'NF01',
    'GET non-existent -> 404 + code NF01',
    JSON.stringify(r)
  );

  // 6. Draft -> 404 NF02
  await request('POST', '/creator-cards', {
    title: 'My Draft Card',
    creator_reference: 'crt_0000000000000001',
    status: 'draft',
  });
  r = await request('GET', '/creator-cards/my-draft-card');
  check(
    r.status === 404 && r.body.code === 'NF02',
    'GET draft -> 404 + code NF02',
    JSON.stringify(r)
  );

  // 7. Private flow: create -> AC03 -> AC04 -> 200
  await request('POST', '/creator-cards', {
    title: 'VIP Rate Card',
    creator_reference: 'crt_x9y8z7w6v5u4t3s2',
    status: 'published',
    access_type: 'private',
    access_code: 'A1B2C3',
  });
  r = await request('GET', '/creator-cards/vip-rate-card');
  check(
    r.status === 403 && r.body.code === 'AC03',
    'GET private no pin -> 403 AC03',
    JSON.stringify(r)
  );
  r = await request('GET', '/creator-cards/vip-rate-card?access_code=WRONG1');
  check(
    r.status === 403 && r.body.code === 'AC04',
    'GET private wrong pin -> 403 AC04',
    JSON.stringify(r)
  );
  r = await request('GET', '/creator-cards/vip-rate-card?access_code=A1B2C3');
  check(
    r.status === 200 && !('access_code' in r.body.data),
    'GET private right pin -> 200, access_code omitted',
    JSON.stringify(r)
  );

  // 8. Delete -> 200 deleted set; then GET -> 404 NF01
  await request('POST', '/creator-cards', {
    title: 'Ada Designs Things',
    creator_reference: 'crt_a1b2c3d4e5f6g7h8',
    status: 'published',
  });
  r = await request('DELETE', '/creator-cards/ada-designs-things', {
    creator_reference: 'crt_a1b2c3d4e5f6g7h8',
  });
  check(
    r.status === 200 &&
      r.body.message === 'Creator Card Deleted Successfully.' &&
      typeof r.body.data.deleted === 'number' &&
      'access_code' in r.body.data,
    'DELETE -> 200, deleted set, creation shape',
    JSON.stringify(r)
  );
  r = await request('GET', '/creator-cards/ada-designs-things');
  check(r.status === 404 && r.body.code === 'NF01', 'GET deleted -> 404 NF01', JSON.stringify(r));

  // 9. AC01 / AC05
  r = await request('POST', '/creator-cards', {
    title: 'Secret Card',
    creator_reference: 'crt_q1w2e3r4t5y6u7i8',
    status: 'published',
    access_type: 'private',
  });
  check(
    r.status === 400 && r.body.code === 'AC01',
    'POST private no code -> 400 AC01',
    JSON.stringify(r)
  );
  r = await request('POST', '/creator-cards', {
    title: 'Public Card',
    creator_reference: 'crt_q1w2e3r4t5y6u7i8',
    status: 'published',
    access_type: 'public',
    access_code: 'A1B2C3',
  });
  check(
    r.status === 400 && r.body.code === 'AC05',
    'POST public with code -> 400 AC05',
    JSON.stringify(r)
  );

  // 10. Malformed JSON body -> 400, no crash
  r = await request('POST', '/creator-cards', null, '{ "title": "broken", ');
  check(r.status === 400, 'POST malformed JSON -> 400 (no crash)', JSON.stringify(r));

  // 11. Unknown route -> 404 global catcher
  r = await request('GET', '/totally/unknown/route');
  check(r.status === 404 && r.body.status === 'error', 'unknown route -> 404', JSON.stringify(r));

  // 12. Auto-slug create -> 200 slug derived
  r = await request('POST', '/creator-cards', {
    title: 'Brand New Creator',
    creator_reference: 'crt_zzzzzzzzzzzzzzzz',
    status: 'published',
  });
  check(
    r.status === 200 && r.body.data.slug === 'brand-new-creator',
    'POST auto-slug -> 200 slug "brand-new-creator"',
    JSON.stringify(r)
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    failures.forEach((f) => console.log(` - ${f}`));
    process.exit(1);
  }
  process.exit(0);
})();
