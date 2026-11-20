import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma/lib/prisma.ts";
import { autenticar } from "../middleware/auth.js";
import { registrarAuditoria } from "../Services/audit.service.js";

const router = Router();
router.post("/login", async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { email: req.body.email }, include: { perfil: true } });
    if (!usuario?.ativo || !(await bcrypt.compare(req.body.senha || "", usuario.senhaHash))) return res.status(401).json({ erro: "Credenciais inválidas." });
    const token = jwt.sign({ id: usuario.id, perfil: usuario.perfil.nome }, process.env.JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil.nome } });
  } catch (e) { return res.status(500).json({ erro: e.message }); }
});
router.get("/me", autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, include: { perfil: true }, omit: { senhaHash: true } });
  return usuario ? res.json(usuario) : res.status(404).json({ erro: "Usuário não encontrado." });
});
router.patch("/password", autenticar, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    if (typeof novaSenha !== "string" || novaSenha.length < 10) return res.status(400).json({ erro: "A nova senha deve ter ao menos 10 caracteres." });
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: req.usuario.id } });
    if (!(await bcrypt.compare(senhaAtual || "", usuario.senhaHash))) return res.status(401).json({ erro: "Senha atual inválida." });
    await prisma.$transaction(async tx => {
      await tx.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await bcrypt.hash(novaSenha, 12) } });
      await registrarAuditoria(tx, { usuarioId: usuario.id, operacao: "ALTERAR_PROPRIA_SENHA", entidadeTipo: "Usuario", entidadeId: usuario.id, valoresAntes: { senhaRedefinida: false }, valoresNovos: { senhaRedefinida: true } });
    });
    return res.json({ senhaAtualizada: true });
  } catch (e) { return res.status(400).json({ erro: e.message }); }
});
export default router;
