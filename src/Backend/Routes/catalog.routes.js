import { Router } from "express";
import { prisma } from "../prisma/lib/prisma.ts";
import bcrypt from "bcryptjs";
import { isAdminUser } from "../middleware/auth.js";

const router = Router();
const resource = (path, model, fields, { soft = true, secret = false } = {}) => {
  const r = Router();
  const admin = (req, res) => {
    if ((model === "usuario" || model === "perfil" || model === "obra") && !isAdminUser(req.usuario)) {
      res.status(403).json({ erro: "Permissão insuficiente." }); return false;
    }
    return true;
  };
  r.get("/", async (req, res) => {
    try { if (!admin(req, res)) return; const where = { ativo: true, ...(model === "obra" && !isAdminUser(req.usuario) ? { id: req.usuario.obraId || -1 } : {}) }; res.json(await prisma[model].findMany({ where, orderBy: { id: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500), ...(secret ? { omit: { senhaHash: true } } : {}) })); }
    catch (e) { res.status(400).json({ erro: e.message }); }
  });
  r.get("/:id", async (req, res) => {
    try { if (!admin(req, res)) return; const row = await prisma[model].findUniqueOrThrow({ where: { id: Number(req.params.id) }, ...(secret ? { omit: { senhaHash: true } } : {}) }); if (model === "obra" && !isAdminUser(req.usuario) && row.id !== req.usuario.obraId) return res.status(403).json({ erro: "Permissão insuficiente." }); res.json(row); }
    catch (e) { res.status(404).json({ erro: "Registro não encontrado." }); }
  });
  r.post("/", async (req, res) => {
    try {
      const data = Object.fromEntries(fields.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
      if (secret && req.body.senha) data.senhaHash = await bcrypt.hash(req.body.senha, 12);
      if (secret && !data.senhaHash) throw new Error("Senha é obrigatória.");
      if (!admin(req, res)) return;
      const row = await prisma[model].create({ data, ...(secret ? { omit: { senhaHash: true } } : {}) });
      res.status(201).json(row);
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  r.patch("/:id", async (req, res) => {
    try {
      const data = Object.fromEntries(fields.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
      if (secret && req.body.senha) data.senhaHash = await bcrypt.hash(req.body.senha, 12);
      if (!admin(req, res)) return;
      const row = await prisma[model].update({ where: { id: Number(req.params.id) }, data, ...(secret ? { omit: { senhaHash: true } } : {}) });
      res.json(row);
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  r.delete("/:id", async (req, res) => {
    try {
      if (!admin(req, res)) return;
      const id = Number(req.params.id);
      const row = soft ? await prisma[model].update({ where: { id }, data: { ativo: false } }) : await prisma[model].delete({ where: { id } });
      res.json(secret ? { id: row.id, ativo: row.ativo } : row);
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  router.use(path, r);
};

resource("/obras", "obra", ["nome", "endereco", "ativo"]);
resource("/equipamentos", "equipamento", ["nome", "chassi", "potenciaCapacidade", "ano", "placa", "ativo"]);
resource("/aplicacoes", "aplicacao", ["nome", "tipo", "equipamentoId", "ativo"]);
resource("/usuarios", "usuario", ["nome", "cpf", "email", "perfilId", "ativo"], { secret: true });
resource("/perfis", "perfil", ["nome", "descricao"], { soft: false });

router.get("/produto-fornecedor", async (req, res) => {
  try { res.json(await prisma.produtoFornecedor.findMany({ where: { ativo: true }, include: { produto: true, fornecedor: true } })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
router.post("/produto-fornecedor", async (req, res) => {
  try { const { produtoId, fornecedorId, precoReferencia } = req.body; if (precoReferencia != null && Number(precoReferencia) < 0) throw new Error("Preço deve ser maior ou igual a zero."); res.status(201).json(await prisma.produtoFornecedor.upsert({ where: { produtoId_fornecedorId: { produtoId: Number(produtoId), fornecedorId: Number(fornecedorId) } }, update: { precoReferencia: precoReferencia == null ? null : Number(precoReferencia), ativo: true }, create: { produtoId: Number(produtoId), fornecedorId: Number(fornecedorId), precoReferencia: precoReferencia == null ? null : Number(precoReferencia) } })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
export default router;
