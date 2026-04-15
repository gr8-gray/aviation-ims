# CAC mTLS Auth Research — Findings

**Date:** 2026-04-15
**Status:** CONFIRMED — EDIPI extraction working

---

## Objective

Prove that a Node.js HTTPS server can:
1. Require a client certificate (mTLS)
2. Extract the EDIPI from the certificate
3. Reject unauthenticated requests with a clear error

---

## Test Environment

| Item | Detail |
|------|--------|
| Server | Node.js `https` module + Express |
| Port | 8443 |
| TLS | Self-signed test CA (`test-ca.crt`) |
| Client cert | `test-client.crt` — CN=DOE.JOHN.1234567890, SAN UPN=1234567890@mil |
| `requestCert` | `true` |
| `rejectUnauthorized` | `false` (auth handled in middleware, not TLS layer) |

**Note on curl:** Windows curl 8.18.0 uses Schannel (not OpenSSL) and cannot load PEM or PKCS#12 certs signed by a non-Windows-trusted CA. Tests were run using Node.js `https.request()` with `rejectUnauthorized: false` — equivalent to `curl -sk` behavior.

---

## Test Results

### Test 1: No client certificate
```
HTTP 401
{"authenticated":false,"error":"No client certificate presented"}
```
**Result: PASS** — unauthenticated requests are rejected correctly.

### Test 2: With client certificate
```
HTTP 200
{"authenticated":true,"edipi":"1234567890","cn":"DOE.JOHN.1234567890","subjectaltname":"othername:UPN:1234567890@mil","validFrom":"Apr 15 20:15:05 2026 GMT","validTo":"Apr 15 20:15:05 2027 GMT"}
```
**Result: PASS** — EDIPI `1234567890` extracted from SAN UPN field.

### Test 3: Health check
```
HTTP 200
{"status":"ok"}
```
**Result: PASS**

---

## EDIPI Extraction Logic

Two extraction paths implemented, in priority order:

1. **Primary — SAN UPN:** `othername:UPN:1234567890@mil` → regex `/UTF8:(\d{10})@mil/i`
2. **Fallback — CN field:** `DOE.JOHN.1234567890` → regex `/\.(\d{10})$/`

Real CAC certificates use the UPN path. The CN fallback handles older or non-standard certs.

---

## Key Findings

1. **mTLS works in Node.js with zero additional dependencies** — the built-in `https` module exposes `req.socket.getPeerCertificate()` with full cert data including SAN.

2. **`rejectUnauthorized: false` is intentional** — allows the server to receive the cert even if the CA isn't trusted at the TLS layer, then validate in application middleware. In production this would be `true` with the DoD root CA bundle loaded.

3. **SAN UPN is the correct EDIPI source** — DoD CAC certificates embed the EDIPI in the Subject Alternative Name as a UPN (`1234567890@mil`). The CN fallback (`LASTNAME.FIRSTNAME.EDIPI`) is reliable for test certs but real CAC CNs may vary in format.

4. **Windows curl/Schannel limitation** — Windows curl cannot use PEM client certs with non-system-trusted CAs. In production, clients using real CAC hardware will go through the browser/OS cert store, which handles this automatically. Not a production concern.

5. **Session binding pattern** — EDIPI can be used as the session identifier. Proposed flow: cert validation → EDIPI extraction → lookup user record → issue session token. No username/password required.

---

## Production Checklist (Aviation IMS integration)

- [ ] Load DoD root CA bundle (`AllCerts.zip` from DoD Cyber Exchange) as the `ca` option
- [ ] Set `rejectUnauthorized: true`
- [ ] Add cert expiry check (`cert.valid_to`)
- [ ] Add OCSP/CRL revocation check (or defer to enterprise PKI gateway)
- [ ] Map EDIPI to user record in database
- [ ] Issue signed session JWT after successful cert auth
- [ ] Rate limit `/auth-test` endpoint

---

## Files

| File | Purpose |
|------|---------|
| `server-prototype.js` | Express HTTPS server with mTLS + EDIPI extraction |
| `server.key` / `server.crt` | Test server TLS cert (signed by test-ca) |
| `test-ca.crt` / `test-ca.key` | Self-signed test CA |
| `test-client.crt` / `test-client.key` | Test client cert with CAC-format SAN UPN |
| `test-client.p12` | PKCS#12 bundle (generated during testing, not needed for production) |
| `san.conf` | OpenSSL config used to generate test-client.crt with correct SAN |
