import jwt from "jsonwebtoken";
import { prisma } from "../prisma/lib/prisma.ts";
export { isAdmin, assertObraAccess, obraScope, isAdminUser, permitir } from "../Services/permissions.service.js";

export async function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ erro: "Authentication required." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(payload.id) }, include: { perfil: true } });
    if (!usuario?.ativo) return res.status(401).json({ erro: "Account inactive or unavailable." });
    req.usuario = { id: usuario.id, perfil: usuario.perfil.nome, obraId: usuario.obraId };
    return next();
  } catch {
    return res.status(401).json({ erro: "Invalid or expired token." });
  }
}
