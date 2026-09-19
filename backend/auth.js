const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { createHash } = require('node:crypto');

function authConfig(env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || secret === 'MY_SECRET_KEY') {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes of random secret material');
  }
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error('Invalid TRUST_PROXY_HOPS');
  return { secret, hops };
}
const validPassword = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const version = user => user.token_version || 0;
const versionFilter = user => version(user) === 0
  ? { $or: [{ token_version: 0 }, { token_version: { $exists: false } }] } : { token_version: user.token_version };

function limiter(limit, keyGenerator) {
  return rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    message: { error: 'Too many attempts. Please try again later.', errorMessage: 'Too many attempts. Please try again later.', message: 'Too many attempts. Please try again later.' },
  });
}
function identityKey(req) {
  const identity = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  return createHash('sha256').update(identity).digest('hex');
}
function createAuth(User, secret) {
  const authenticateToken = async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Please sign in again' });
    let payload;
    try {
      payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
      if (!payload || typeof payload.id !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.id) ||
          !Number.isInteger(payload.exp) || !Number.isInteger(payload.ver)) throw new Error('Invalid session');
    } catch { return res.status(401).json({ error: 'Session expired or invalid. Please sign in again' }); }
    try {
      const user = await User.findById(payload.id);
      if (!user || version(user) !== payload.ver) return res.status(401).json({ error: 'Session ended. Please sign in again' });
      req.user = { id: payload.id, username: user.username };
      next();
    } catch { res.status(503).json({ error: 'Unable to verify your session right now' }); }
  };
  const login = async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!text(username, 80) || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
        return res.status(400).json({ errorMessage: 'Enter a valid username and password' });
      }
      const user = await User.findOne({ username: username.trim() });
      if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ errorMessage: 'Invalid username or password' });
      const jwtToken = jwt.sign({ id: String(user._id), username: user.username, ver: version(user) }, secret, { algorithm: 'HS256', expiresIn: '1d' });
      res.json({ jwtToken });
    } catch { res.status(503).json({ errorMessage: 'Unable to sign in right now' }); }
  };
  const register = async (req, res) => {
    try {
      const { name, username, gender, email, password } = req.body || {};
      if (!text(name, 120) || !text(username, 80) || !text(email, 254) ||
          !/^\S+@\S+\.\S+$/.test(email.trim()) || !['Male', 'Female', 'Others'].includes(gender) || !validPassword(password)) {
        return res.status(400).json({ message: 'Provide valid account details and a password of at least 8 characters (maximum 72 UTF-8 bytes)' });
      }
      await User.create({ name: name.trim(), username: username.trim(), gender,
        email: email.trim().toLowerCase(), password: await bcrypt.hash(password, 10), token_version: 0 });
      res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Username or email is already in use' });
      if (error.name === 'ValidationError') return res.status(400).json({ message: 'Invalid account details' });
      res.status(503).json({ message: 'Unable to create your account right now' });
    }
  };
  const changePassword = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword) > 72 || !validPassword(newPassword)) {
        return res.status(400).json({ error: 'Enter your current password and a new password of 8 or more characters (maximum 72 UTF-8 bytes)' });
      }
      const user = await User.findById(req.user.id);
      if (!user || !(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ error: 'Current password is incorrect' });
      if (await bcrypt.compare(newPassword, user.password)) return res.status(400).json({ error: 'New password must be different' });
      const result = await User.updateOne({ _id: user._id, password: user.password, ...versionFilter(user) },
        { $set: { password: await bcrypt.hash(newPassword, 10) }, $inc: { token_version: 1 } });
      if (!result.modifiedCount) return res.status(409).json({ error: 'Account changed. Sign in again and retry' });
      res.json({ message: 'Password changed. Please sign in again.', sessionExpired: true });
    } catch { res.status(503).json({ error: 'Unable to change password right now' }); }
  };
  return { authenticateToken, login, register, changePassword };
}
module.exports = { authConfig, createAuth, validPassword, versionFilter, limiter, identityKey };
