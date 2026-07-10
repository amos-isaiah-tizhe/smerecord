'use strict';
/**
 * middleware/verifyTurnstile.js
 * Verifies a Cloudflare Turnstile token sent from the frontend.
 * Expects req.body.turnstileToken (string).
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

module.exports = async function verifyTurnstile(req, res, next) {
  try {
    // Dev escape hatch — skip if no secret configured (local testing)
    if (!process.env.TURNSTILE_SECRET_KEY) {
      if (process.env.NODE_ENV !== 'production') return next();
      return res.status(500).json({ success: false, message: 'Bot protection not configured' });
    }

    const token = req.body?.turnstileToken;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Please complete the bot check.' });
    }

    const form = new URLSearchParams();
    form.append('secret', process.env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    form.append('remoteip', req.ip);

    const r = await fetch(VERIFY_URL, { method: 'POST', body: form });
    const data = await r.json();

    if (!data.success) {
      console.warn('[Turnstile] failed:', data['error-codes']);
      return res.status(403).json({ success: false, message: 'Bot check failed. Please try again.' });
    }

    // Strip the token so it doesn't pollute the rest of the controller
    delete req.body.turnstileToken;
    return next();
  } catch (err) {
    console.error('[Turnstile] verify error:', err.message);
    return res.status(500).json({ success: false, message: 'Bot verification unavailable' });
  }
};
