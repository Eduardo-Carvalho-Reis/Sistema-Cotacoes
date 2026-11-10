import jwt from "jsonwebtoken";

export function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ erro: "Autenticação necessária." });
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

export function permitir(...perfis) {
  return (req, res, next) => perfis.includes(req.usuario?.perfil)
    ? next()
    : res.status(403).json({ erro: "Permissão insuficiente." });
}
