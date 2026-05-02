const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * Verify the Bearer JWT and attach req.user.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, name, email, role, clinic_id, department_id FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verify a Socket.IO handshake token. Returns the user row or null.
 */
async function verifySocketToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, name, email, role, clinic_id FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

module.exports = { authenticate, verifySocketToken };
