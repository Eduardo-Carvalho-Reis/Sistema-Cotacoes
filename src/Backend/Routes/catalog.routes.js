import { Router } from "express";
import { prisma } from "../prisma/lib/prisma.ts";
import bcrypt from "bcryptjs";
import { isAdminUser } from "../middleware/auth.js";
import { registrarAuditoria } from "../Services/audit.service.js";

const router = Router();
const resource = (path, model, fields, { soft = true, secret = false } = {}) => {
  const r = Router();
  const admin = (req, res) => {
    if (model === "perfil" && !isAdminUser(req.usuario)) {
      res.status(403).json({ erro: "Permissao insuficiente." });
      return false;
    }
    return true;
  };
  const canWrite = (req, res) => !["obra", "categoriaProduto"].includes(model) || isAdminUser(req.usuario) || (res.status(403).json({ erro: "Only administrators can manage global reference data." }), false);

  r.get("/", async (req, res) => {
    try {
      if (!admin(req, res)) return;
      const where = {
        ...(!["usuario", "perfil"].includes(model) ? { ativo: true } : {}),
        ...(model === "obra" && !isAdminUser(req.usuario) ? { id: req.usuario.obraId || -1 } : {}),
      };
      res.json(await prisma[model].findMany({
        where,
        include: model === "usuario" ? { perfil: true, obra: true } : undefined,
        orderBy: { id: "desc" },
        take: Math.min(Number(req.query.limite) || 100, 500),
        ...(secret ? { omit: { senhaHash: true } } : {}),
      }));
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  r.get("/:id", async (req, res) => {
    try {
      if (!admin(req, res)) return;
      if (model === "usuario" && !isAdminUser(req.usuario) && Number(req.params.id) !== req.usuario.id) return res.status(403).json({ erro: "Permissao insuficiente." });
      const row = await prisma[model].findUniqueOrThrow({ where: { id: Number(req.params.id) }, ...(secret ? { omit: { senhaHash: true } } : {}) });
      if (model === "obra" && !isAdminUser(req.usuario) && row.id !== req.usuario.obraId) return res.status(403).json({ erro: "Permissao insuficiente." });
      res.json(row);
    } catch { res.status(404).json({ erro: "Registro nao encontrado." }); }
  });

  r.post("/", async (req, res) => {
    try {
      if ((secret && !isAdminUser(req.usuario)) || !admin(req, res) || !canWrite(req, res)) return res.status(403).json({ erro: "Permissao insuficiente." });
      const data = Object.fromEntries(fields.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
      if (secret) {
        if (typeof req.body.senha !== "string" || req.body.senha.length < 10) throw new Error("Initial password must have at least 10 characters.");
        const perfil = await prisma.perfil.findUniqueOrThrow({ where: { id: Number(data.perfilId) } });
        if (perfil.nome === "USUARIO_PADRAO") {
          if (!await prisma.obra.findFirst({ where: { id: Number(data.obraId), ativo: true } })) throw new Error("Standard users must be assigned to an active worksite.");
        } else data.obraId = null;
        data.senhaHash = await bcrypt.hash(req.body.senha, 12);
      }
      const row = await prisma.$transaction(async tx => {
        const created = await tx[model].create({ data, ...(secret ? { omit: { senhaHash: true } } : {}) });
        if (secret) await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CRIAR_USUARIO", entidadeTipo: "Usuario", entidadeId: created.id, valoresNovos: { nome: created.nome, email: created.email, perfilId: created.perfilId, obraId: created.obraId, ativo: created.ativo } });
        return created;
      });
      res.status(201).json(row);
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  r.patch("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const selfEdit = secret && id === req.usuario.id && !isAdminUser(req.usuario);
      if ((!selfEdit && !admin(req, res)) || !canWrite(req, res)) return res.status(403).json({ erro: "Permissao insuficiente." });
      const allowedFields = selfEdit ? ["nome", "cpf", "telefone"] : fields;
      const data = Object.fromEntries(allowedFields.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
      const row = await prisma.$transaction(async tx => {
        const before = await tx[model].findUniqueOrThrow({ where: { id }, ...(secret ? { omit: { senhaHash: true } } : {}) });
        if (secret && !selfEdit) {
          if (req.body.senha !== undefined) {
            if (typeof req.body.senha !== "string" || req.body.senha.length < 10) throw new Error("Password must have at least 10 characters.");
            data.senhaHash = await bcrypt.hash(req.body.senha, 12);
          }
          const perfil = await tx.perfil.findUniqueOrThrow({ where: { id: Number(data.perfilId ?? before.perfilId) } });
          const obraId = data.obraId !== undefined ? Number(data.obraId) : before.obraId;
          if (perfil.nome === "USUARIO_PADRAO") {
            if (!obraId || !await tx.obra.findFirst({ where: { id: obraId, ativo: true } })) throw new Error("Standard users must be assigned to an active worksite.");
            data.obraId = obraId;
          } else data.obraId = null;
          if (id === req.usuario.id && data.ativo === false) throw new Error("You cannot deactivate your own account.");
        }
        const updated = await tx[model].update({ where: { id }, data, ...(secret ? { omit: { senhaHash: true } } : {}) });
        if (secret) await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ATUALIZAR_USUARIO", entidadeTipo: "Usuario", entidadeId: id, valoresAntes: { nome: before.nome, email: before.email, perfilId: before.perfilId, obraId: before.obraId, ativo: before.ativo }, valoresNovos: { nome: updated.nome, email: updated.email, perfilId: updated.perfilId, obraId: updated.obraId, ativo: updated.ativo } });
        return updated;
      });
      res.json(row);
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  r.delete("/:id", async (req, res) => {
    try {
      if ((secret && !isAdminUser(req.usuario)) || !admin(req, res) || !canWrite(req, res)) return res.status(403).json({ erro: "Permissao insuficiente." });
      const id = Number(req.params.id);
      const row = secret ? await prisma.$transaction(async tx => {
        const before = await tx[model].findUniqueOrThrow({ where: { id }, omit: { senhaHash: true } });
        if (id === req.usuario.id) throw new Error("You cannot deactivate your own account.");
        const updated = await tx[model].update({ where: { id }, data: { ativo: false }, omit: { senhaHash: true } });
        await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "DESATIVAR_USUARIO", entidadeTipo: "Usuario", entidadeId: id, valoresAntes: { ativo: before.ativo }, valoresNovos: { ativo: updated.ativo } });
        return updated;
      }) : soft ? await prisma[model].update({ where: { id }, data: { ativo: false } }) : await prisma[model].delete({ where: { id } });
      res.json(secret ? { id: row.id, ativo: row.ativo } : row);
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  router.use(path, r);
};

resource("/obras", "obra", ["nome", "endereco", "ativo"]);
resource("/categorias-produto", "categoriaProduto", ["nome", "descricao", "ativo"]);
resource("/equipamentos", "equipamento", ["nome", "chassi", "potenciaCapacidade", "ano", "placa", "ativo"]);
resource("/aplicacoes", "aplicacao", ["nome", "tipo", "equipamentoId", "ativo"]);
resource("/usuarios", "usuario", ["nome", "cpf", "telefone", "email", "perfilId", "obraId", "ativo"], { secret: true });
resource("/perfis", "perfil", ["nome", "descricao"], { soft: false });

router.post("/usuarios/:id/redefinir-senha", async (req, res) => {
  try {
    if (!isAdminUser(req.usuario)) return res.status(403).json({ erro: "Insufficient permission." });
    if (typeof req.body.senha !== "string" || req.body.senha.length < 10) throw new Error("Temporary password must have at least 10 characters.");
    const id = Number(req.params.id);
    await prisma.$transaction(async tx => {
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { id } });
      await tx.usuario.update({ where: { id }, data: { senhaHash: await bcrypt.hash(req.body.senha, 12) } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "REDEFINIR_SENHA", entidadeTipo: "Usuario", entidadeId: id, valoresAntes: { senhaRedefinida: false }, valoresNovos: { senhaRedefinida: true }, detalhes: { usuario: usuario.email } });
    });
    res.json({ id, senhaRedefinida: true });
  } catch (e) { res.status(e.code === "P2025" ? 404 : 400).json({ erro: e.message }); }
});

router.get("/produto-fornecedor", async (_req, res) => {
  try { res.json(await prisma.produtoFornecedor.findMany({ where: { ativo: true }, include: { produto: true, fornecedor: true } })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});
router.post("/produto-fornecedor", async (req, res) => {
  try {
    const { produtoId, fornecedorId, precoReferencia } = req.body;
    if (precoReferencia != null && Number(precoReferencia) < 0) throw new Error("Price must be zero or greater.");
    res.status(201).json(await prisma.produtoFornecedor.upsert({
      where: { produtoId_fornecedorId: { produtoId: Number(produtoId), fornecedorId: Number(fornecedorId) } },
      update: { precoReferencia: precoReferencia == null ? null : Number(precoReferencia), ativo: true },
      create: { produtoId: Number(produtoId), fornecedorId: Number(fornecedorId), precoReferencia: precoReferencia == null ? null : Number(precoReferencia) },
    }));
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

export default router;
