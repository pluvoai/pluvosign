// Optional "demo tenant" feature.
//
// All wrappers below are NO-OPS for any deployment where no tenant has
// `IsDemo: true`. For a typical client deployment this file does nothing —
// it ships in the image but never affects normal operation. The feature
// is activated by setting `IsDemo: true` on a single `partners_Tenant`
// record (used here for the demopluvosign.pluvoai.com tenant).
//
// All wrappers preserve the original cloud function's signature and call it
// unchanged when the demo gate doesn't apply, so OpenSign updates to those
// cloud functions can't break this layer.

const DAILY_EMAIL_CAP = 20;

// --- helpers ---

async function getExtUserByEmail(email) {
  if (!email) return null;
  const q = new Parse.Query('contracts_Users');
  q.equalTo('Email', email);
  return await q.first({ useMasterKey: true });
}

async function getExtUserById(extUserId) {
  if (!extUserId) return null;
  try {
    const q = new Parse.Query('contracts_Users');
    return await q.get(extUserId, { useMasterKey: true });
  } catch {
    return null;
  }
}

async function getExtUserFromSessionUser(parseUser) {
  if (!parseUser) return null;
  const q = new Parse.Query('contracts_Users');
  q.equalTo('UserId', parseUser);
  return await q.first({ useMasterKey: true });
}

async function getTenantOf(extUser) {
  if (!extUser) return null;
  const tenantPtr = extUser.get('TenantId');
  if (!tenantPtr) return null;
  try {
    return await tenantPtr.fetch({ useMasterKey: true });
  } catch {
    return null;
  }
}

function isDemoTenant(tenant) {
  return Boolean(tenant && tenant.get('IsDemo'));
}

async function incrementDailyCount(extUser) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const lastDate = extUser.get('DailyEmailDate');
  const count = lastDate === today ? extUser.get('DailyEmailCount') || 0 : 0;
  extUser.set('DailyEmailDate', today);
  extUser.set('DailyEmailCount', count + 1);
  await extUser.save(null, { useMasterKey: true });
  return count + 1;
}

async function currentDailyCount(extUser) {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = extUser.get('DailyEmailDate');
  return lastDate === today ? extUser.get('DailyEmailCount') || 0 : 0;
}

// --- wrappers ---

// sendmailv3: signing requests + completion notifications. Demo: recipient
// must equal the sender's own email; counts toward the 20/day cap.
export function withSendMailDemoLimit(originalFn) {
  return async (request) => {
    const extUser = await getExtUserById(request.params?.extUserId);
    const tenant = await getTenantOf(extUser);
    if (!isDemoTenant(tenant)) return originalFn(request);

    const senderEmail = (extUser.get('Email') || '').toLowerCase();
    const recipient = (request.params?.recipient || '').toLowerCase();
    if (!senderEmail || !recipient) {
      throw new Parse.Error(400, 'Demo mode: missing sender or recipient email.');
    }
    if (recipient !== senderEmail) {
      throw new Parse.Error(
        400,
        'Demo mode: signing requests can only be sent to your own email address.'
      );
    }
    if ((await currentDailyCount(extUser)) >= DAILY_EMAIL_CAP) {
      throw new Parse.Error(
        429,
        `Demo daily limit reached (${DAILY_EMAIL_CAP} emails/day). The counter resets at midnight UTC.`
      );
    }
    await incrementDailyCount(extUser);
    return originalFn(request);
  };
}

// SendOTPMailV1: OTP to a guest signer. May be called by an unauthenticated
// guest. Demo: look up the doc; if its creator is on a demo tenant, the OTP
// recipient must equal the doc creator's own email.
export function withOtpDemoLimit(originalFn) {
  return async (request) => {
    const docId = request.params?.docId;
    if (!docId) return originalFn(request); // no doc context — let it through

    let doc;
    try {
      const q = new Parse.Query('contracts_Document');
      q.include('ExtUserPtr');
      q.include('ExtUserPtr.TenantId');
      doc = await q.get(docId, { useMasterKey: true });
    } catch {
      return originalFn(request);
    }

    const creator = doc.get('ExtUserPtr');
    const tenant = creator && creator.get('TenantId');
    if (!isDemoTenant(tenant)) return originalFn(request);

    const creatorEmail = (creator.get('Email') || '').toLowerCase();
    const recipient = (request.params?.email || '').toLowerCase();
    if (recipient !== creatorEmail) {
      throw new Parse.Error(
        400,
        'Demo mode: OTP can only be sent to the document creator.'
      );
    }
    if ((await currentDailyCount(creator)) >= DAILY_EMAIL_CAP) {
      throw new Parse.Error(
        429,
        `Demo daily limit reached (${DAILY_EMAIL_CAP} emails/day). The counter resets at midnight UTC.`
      );
    }
    await incrementDailyCount(creator);
    return originalFn(request);
  };
}

// batchdocuments / forwarddoc: blanket-rejected for demo (sending to many
// recipients, or forwarding to a third party, has no place in a self-demo).
export function withDemoReject(originalFn, message) {
  return async (request) => {
    const extUser = await getExtUserFromSessionUser(request.user);
    const tenant = await getTenantOf(extUser);
    if (isDemoTenant(tenant)) {
      throw new Parse.Error(403, message);
    }
    return originalFn(request);
  };
}

// getlogobydomain: OpenSign's signup gate. Its fallback returns user:'exist'
// whenever ANY tenant exists in the DB — which blocks multi-tenant signup
// (e.g. our demo subdomain). This wrap restores per-domain semantics:
//
// - For the demo URL (DEMO_HOSTNAME env var), always return user:'exist'.
//   Login.jsx uses this field to decide whether to redirect to /addadmin
//   (it redirects on 'not_exist'), so we MUST return 'exist' here or login
//   loops back to the signup page. The signup gate is bypassed on the
//   frontend instead (AddAdmin.jsx checks isDemoHost()).
// - For other domains, if no tenant exists yet, return 'not_exist' to allow
//   the first admin to sign up.
// - Otherwise (real client tenant), preserve the original 'exist' gate.
export function withTenantAwareGetLogoByDomain(originalFn) {
  return async (request) => {
    const result = await originalFn(request);
    const domain = request.params?.domain;
    if (!domain || !result) return result;

    const demoHostname = process.env.DEMO_HOSTNAME;
    if (demoHostname && domain === demoHostname) {
      return { ...result, user: 'exist' };
    }

    if (result.user !== 'exist') return result;
    const q = new Parse.Query('partners_Tenant');
    q.equalTo('Domain', domain);
    const tenantForDomain = await q.first({ useMasterKey: true });
    if (!tenantForDomain) {
      return { ...result, user: 'not_exist' };
    }
    return result;
  };
}

// addadmin: when the signup happens on a demo tenant, email the configured
// admin (DEMO_NOTIFY_EMAIL env var) with the new account's details, so we
// know who's trying the demo. Silent no-op if the env var isn't set, or if
// the signup is on a non-demo tenant.
function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function withDemoSignupNotification(originalFn) {
  return async (request) => {
    const result = await originalFn(request);
    try {
      const publicUrl = request.headers?.public_url || '';
      const domain = publicUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!domain) return result;

      // Identify the demo URL by DEMO_HOSTNAME env var (the canonical source
      // of truth). No anchor tenant needed — so the cleanup script can wipe
      // the originally-created demo tenant without breaking this wrapper.
      const demoHostname = process.env.DEMO_HOSTNAME;
      if (!demoHostname || domain !== demoHostname) return result;

      // Flag the prospect's brand-new tenant as IsDemo too, so the email and
      // bulk-send limits fire for them. AddAdmin creates a fresh tenant per
      // signup and doesn't set Domain — we look it up via the user's email.
      const u = request.params?.userDetails || {};
      const userEmail = u.email?.toLowerCase()?.trim();
      if (userEmail) {
        try {
          const uq = new Parse.Query('contracts_Users');
          uq.equalTo('Email', userEmail);
          const newUser = await uq.first({ useMasterKey: true });
          const newTenantPtr = newUser?.get('TenantId');
          if (newTenantPtr) {
            const newTenant = await newTenantPtr.fetch({ useMasterKey: true });
            if (newTenant && !newTenant.get('IsDemo')) {
              newTenant.set('IsDemo', true);
              await newTenant.save(null, { useMasterKey: true });
            }
          }
        } catch (e) {
          console.log('demo flag-new-tenant err:', e);
        }
      }

      // Send signup notification to the configured admin inbox.
      const notifyEmail = process.env.DEMO_NOTIFY_EMAIL;
      if (!notifyEmail) return result;
      const subject = `New demo signup: ${u.name || u.email || 'unknown'}`;
      const html = `<p>A new account just signed up on the PluvoSign demo.</p>
<table cellpadding="6" cellspacing="0" style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse;">
<tr><td><b>Name:</b></td><td>${htmlEscape(u.name)}</td></tr>
<tr><td><b>Email:</b></td><td>${htmlEscape(u.email)}</td></tr>
<tr><td><b>Phone:</b></td><td>${htmlEscape(u.phone) || '(not provided)'}</td></tr>
<tr><td><b>Company:</b></td><td>${htmlEscape(u.company)}</td></tr>
<tr><td><b>Job title:</b></td><td>${htmlEscape(u.jobTitle)}</td></tr>
<tr><td><b>Demo URL:</b></td><td>${htmlEscape(publicUrl)}</td></tr>
<tr><td><b>Time (UTC):</b></td><td>${new Date().toISOString()}</td></tr>
</table>`;

      await Parse.Cloud.sendEmail({
        sender: process.env.SMTP_USER_EMAIL || notifyEmail,
        recipient: notifyEmail,
        subject,
        html,
      });
    } catch (err) {
      console.log('demo signup notification err:', err);
    }
    return result;
  };
}
