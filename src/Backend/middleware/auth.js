import jwt from "jsonwebtoken";
import { prisma } from "../prisma/lib/prisma.ts";

export async function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ erro: "Autenticação necessária." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(payload.id) }, include: { perfil: true } });
    if (!usuario?.ativo) return res.status(401).json({ erro: "Conta inativa ou inexistente." });
    req.usuario = { id: usuario.id, perfil: usuario.perfil.nome, obraId: usuario.obraId };
    return next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

export function isAdmin(usuario) {
  return ["ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"].includes(usuario?.perfil);
}

export function assertObraAccess(usuario, obraId) {
  if (!isAdmin(usuario) && Number(usuario?.obraId) !== Number(obraId)) {
    const error = new Error("Você não tem permissão para acessar esta obra.");
    error.status = 403;
    throw error;
  }
}

export function obraScope(usuario, field = "obraId") {
  return isAdmin(usuario) ? {} : { [field]: usuario?.obraId ?? -1 };
}

export function isAdminUser(usuario) {
  return isAdmin(usuario);
}

export function permitir(...perfis) {
  return (req, res, next) => perfis.includes(req.usuario?.perfil)
    ? next()
    : res.status(403).json({ erro: "Permissão insuficiente." });
}
