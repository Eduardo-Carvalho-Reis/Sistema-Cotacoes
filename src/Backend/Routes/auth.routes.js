import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma/lib/prisma.ts";
import { autenticar } from "../middleware/auth.js";

const router = Router();
router.post("/bootstrap", async (req, res) => {
  try {
    if (await prisma.usuario.count()) return res.status(409).json({ erro: "O administrador inicial já foi criado." });
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha || senha.length < 10) return res.status(400).json({ erro: "Informe nome, e-mail e senha com ao menos 10 caracteres." });
    const perfil = await prisma.perfil.upsert({ where: { nome: "ADMINISTRADOR_SISTEMA" }, update: {}, create: { nome: "ADMINISTRADOR_SISTEMA", descricao: "Administração do sistema" } });
    const usuario = await prisma.usuario.create({ data: { nome, email, senhaHash: await bcrypt.hash(senha, 12), perfilId: perfil.id } });
    return res.status(201).json({ id: usuario.id, nome: usuario.nome, email: usuario.email });
  } catch (e) { return res.status(400).json({ erro: e.message }); }
});
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
export default router;
