const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Normalize an identifier (UUID or UUID|SERIAL): uppercase, keep only
// characters that survive across machines consistently. We keep 0-9, A-F,
// and the pipe separator so a combined "UUID|SERIAL" string stays intact.
// If you sign UUID-only, this still works (no pipe present).
function normalizeId(id) {
  return String(id || '')
    .toUpperCase()
    .replace(/[^0-9A-F|]/g, '');
}

function verifyLicense() {
  try {
    const hostIdRaw = process.env.HOST_ID;
    if (!hostIdRaw) {
      console.error('LICENSE ERROR: HOST_ID not provided. App cannot start.');
      process.exit(1);
    }

    const hostId = normalizeId(hostIdRaw);

    const tokenPath = '/license/license.key';
    const pubKeyPath = path.join(__dirname, 'license_public.pem');

    if (!fs.existsSync(tokenPath)) {
      console.error('LICENSE ERROR: license.key not found at /license/license.key. App cannot start.');
      process.exit(1);
    }
    if (!fs.existsSync(pubKeyPath)) {
      console.error('LICENSE ERROR: license_public.pem missing from image. Build problem.');
      process.exit(1);
    }

    const token = fs.readFileSync(tokenPath, 'utf8').trim();
    const pubKey = fs.readFileSync(pubKeyPath, 'utf8');

    const verifier = crypto.createVerify('SHA256');
    verifier.update(hostId);
    verifier.end();

    const valid = verifier.verify(pubKey, Buffer.from(token, 'base64'));

    if (!valid) {
      console.error('==================================================');
      console.error(' LICENSE INVALID');
      console.error(' This software is licensed to run on ONE authorized');
      console.error(' computer only. The license does not match this machine.');
      console.error(' Contact the developer to obtain a valid license.');
      console.error('==================================================');
      process.exit(1);
    }

    console.log('License verified OK for this machine.');
  } catch (err) {
    console.error('LICENSE CHECK FAILED:', err.message);
    process.exit(1);
  }
}

module.exports = { verifyLicense, normalizeId };
