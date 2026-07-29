'use strict';

/**
 * Server-side shared constants — single source of truth.
 *
 * DEV_EDIPI: the dev-auth fallback identity used when DEV_AUTH=true and no
 * X-Dev-EDIPI header is sent. The seed scripts provision this EDIPI as the
 * admin user, and auth.js falls back to it. Previously this literal was
 * duplicated across auth.js, seed.js, and setup.js and could drift.
 *
 * Note: the client (client/src/api.js, VITE_DEV_EDIPI default) and
 * screenshots.mjs still carry their own copy of this value — they run in a
 * different runtime and cannot import server code. If you ever change
 * DEV_EDIPI, update those two defaults too.
 */
const DEV_EDIPI = '0000000001';

module.exports = { DEV_EDIPI };
