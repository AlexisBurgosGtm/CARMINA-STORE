const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'shop-store-secret-key-2024';

// Super usuario hardcodeado
const SUPER_USER = {
  USER: 'ALEXIS',
  PASS: '2410201415082017',
  TIPO: 'ADMINISTRADOR',
};

function signToken(user) {
  return jwt.sign(
    { user: user.USER, tipo: user.TIPO },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token =
    (header.startsWith('Bearer ') ? header.slice(7) : null) ||
    req.cookies?.token ||
    req.query?.token;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.tipo !== 'ADMINISTRADOR') {
    return res.status(403).json({ error: 'Se requiere perfil ADMINISTRADOR' });
  }
  next();
}

module.exports = { SUPER_USER, signToken, authRequired, adminRequired, JWT_SECRET };
