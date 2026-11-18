import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../prisma/lib/prisma.ts";
import { WhatsAppProvider } from "../Services/whatsapp.service.js";
import { permitir, assertObraAccess, obraScope, isAdminUser } from "../middleware/auth.js";
import { registrarAuditoria } from "../Services/audit.service.js";
import { validarTransicaoCotacao, respostasEstaoPendentes } from "../Services/cotacao-state.service.js";

const router = Router();
const whatsapp = new WhatsAppProvider();
const fail = (res, e) => res.status(e.status || (e.code === "P2025" ? 404 : e.code === "P2002" ? 409 : 400)).json({ erro: e.message });

async function concluirCompraSePronta(tx, compraId, usuarioId) {
  const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
  if (compra.status === "CANCELADA" || compra.status === "CONCLUIDA") return;
  const pedidos = await tx.pedidoCompra.findMany({
    where: { compraId },
    include: { notasFiscais: true, itens: { include: { recebimentos: true } } },
  });
  const todosConcluidos = pedidos.length > 0 && pedidos.every(pedido =>
    pedido.status !== "CANCELADO"
    && pedido.notasFiscais.length > 0
    && pedido.itens.length > 0
    && pedido.itens.every(item => item.recebimentos.reduce((sum, recebimento) => sum + Number(recebimento.quantidadeRecebida), 0) >= Number(item.quantidade))
  );
  if (!todosConcluidos) return;
  await tx.compra.update({ where: { id: compraId }, data: { status: "CONCLUIDA" } });
  await tx.historicoStatus.create({ data: {
    entidadeTipo: "Compra",
    entidadeId: compraId,
    statusAnterior: compra.status,
    statusNovo: "CONCLUIDA",
    usuarioId,
    compraId,
    observacao: "Todos os produtos foram recebidos e as notas fiscais foram lanÃ§adas.",
  } });
}

router.post("/cotacoes", async (req, res) => {
  try {
    const { obraId, observacao, itens, fornecedorIds } = req.body;
    if (!Number.isInteger(obraId) || !Array.isArray(itens) || !itens.length) throw new Error("Informe uma obra e ao menos um item.");
    assertObraAccess(req.usuario, obraId);
    const cotacao = await prisma.$transaction(async tx => {
      const produtos = await tx.produto.findMany({ where: { id: { in: [...new Set(itens.map(i => Number(i.produtoId)))] } } });
      const c = await tx.cotacaoEnvio.create({ data: { obraId, usuarioId: req.usuario.id, observacao, itens: { create: itens.map(i => {
        const quantidade = Number(i.quantidadeSolicitada);
        if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("A quantidade solicitada deve ser maior que zero.");
        const produto = produtos.find(p => p.id === Number(i.produtoId));
        if (!produto) throw new Error("Produto nÃ£o encontrado.");
        const unidade = i.unidade || produto.unidade;
        if (unidade !== produto.unidade) throw new Error("ConversÃµes de unidade nÃ£o configuradas; use a unidade cadastrada do produto.");
        return { produtoId: produto.id, quantidadeSolicitada: quantidade, unidade, aplicacaoId: i.aplicacaoId ? Number(i.aplicacaoId) : null };
      }) }, fornecedores: { create: [...new Set(fornecedorIds || [])].map(id => ({ fornecedorId: Number(id) })) } }, include: { itens: true, fornecedores: true } });
      return c;
    });
    res.status(201).json(cotacao);
  } catch (e) { fail(res, e); }
});

router.get("/cotacoes", async (req, res) => {
  try {
    const { obraId, status, de, ate, produtoId } = req.query;
    const page = Math.max(1, Number(req.query.pagina) || 1), limite = Math.min(100, Math.max(1, Number(req.query.limite) || 25));
    const rows = await prisma.cotacaoEnvio.findMany({ where: { ...obraScope(req.usuario), ...(isAdminUser(req.usuario) && obraId ? { obraId: Number(obraId) } : {}), status: status || undefined, dataCriacao: de || ate ? { gte: de ? new Date(de) : undefined, lte: ate ? new Date(ate) : undefined } : undefined, itens: produtoId ? { some: { produtoId: Number(produtoId) } } : undefined }, include: { obra: true, usuario: { select: { id: true, nome: true } }, itens: { include: { produto: true, aplicacao: true } }, fornecedores: { include: { fornecedor: true } }, respostas: { include: { fornecedor: true, itens: { include: { produto: true } } } } }, orderBy: { dataCriacao: "desc" }, skip: (page - 1) * limite, take: limite });
    res.json(rows);
  } catch (e) { fail(res, e); }
});

router.patch("/cotacoes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const atual = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id }, include: { respostas: true, compras: true, itens: true, fornecedores: true } });
    assertObraAccess(req.usuario, atual.obraId);
    if (atual.status !== "RASCUNHO" || atual.respostas.length || atual.compras.length) throw new Error("Somente cotaÃ§Ãµes em rascunho sem respostas ou compras podem ser editadas.");
    const payload = req.body;
    const updated = await prisma.$transaction(async tx => {
      const data = {};
      if (payload.observacao !== undefined) data.observacao = payload.observacao;
      if (payload.itens !== undefined) {
        if (!Array.isArray(payload.itens) || !payload.itens.length) throw new Error("A cotaÃ§Ã£o precisa ter ao menos um item.");
        const produtos = await tx.produto.findMany({ where: { id: { in: [...new Set(payload.itens.map(i => Number(i.produtoId)))] }, ativo: true } });
        const novosItens = payload.itens.map(i => {
          const produto = produtos.find(p => p.id === Number(i.produtoId));
          const quantidade = Number(i.quantidadeSolicitada);
          if (!produto || !Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Produto ou quantidade invÃ¡lidos.");
          if ((i.unidade || produto.unidade) !== produto.unidade) throw new Error("ConversÃµes de unidade nÃ£o configuradas; use a unidade cadastrada do produto.");
          return { produtoId: produto.id, quantidadeSolicitada: quantidade, unidade: produto.unidade, aplicacaoId: i.aplicacaoId ? Number(i.aplicacaoId) : null };
        });
        await tx.cotacaoEnvioItem.deleteMany({ where: { cotacaoEnvioId: id } });
        await tx.cotacaoEnvioItem.createMany({ data: novosItens.map(item => ({ ...item, cotacaoEnvioId: id })) });
      }
      if (payload.fornecedorIds !== undefined) {
        if (!Array.isArray(payload.fornecedorIds) || !payload.fornecedorIds.length) throw new Error("Selecione ao menos um fornecedor.");
        await tx.cotacaoEnvioFornecedor.deleteMany({ where: { cotacaoEnvioId: id } });
        await tx.cotacaoEnvioFornecedor.createMany({ data: [...new Set(payload.fornecedorIds.map(Number))].map(fornecedorId => ({ cotacaoEnvioId: id, fornecedorId })) });
      }
      const row = await tx.cotacaoEnvio.update({ where: { id }, data, include: { itens: true, fornecedores: true } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ATUALIZAR", entidadeTipo: "CotacaoEnvio", entidadeId: id, valoresAntes: { observacao: atual.observacao, itens: atual.itens, fornecedores: atual.fornecedores }, valoresNovos: { observacao: row.observacao, itens: row.itens, fornecedores: row.fornecedores }, cotacaoEnvioId: id });
      return row;
    });
    res.json(updated);
  } catch (e) { fail(res, e); }
});

router.post("/cotacoes/:id/cancelar", async (req, res) => {
  try {
    const id = Number(req.params.id), motivo = String(req.body.motivo || "").trim();
    if (!motivo) throw new Error("Informe o motivo do cancelamento.");
    const result = await prisma.$transaction(async tx => {
      const atual = await tx.cotacaoEnvio.findUniqueOrThrow({ where: { id }, include: { respostas: true, compras: true } });
      assertObraAccess(req.usuario, atual.obraId);
      validarTransicaoCotacao(atual.status, "CANCELADA");
      if (atual.compras.some(c => c.status !== "CANCELADA")) throw new Error("Cancele a compra vinculada antes de cancelar a cotaÃ§Ã£o.");
      const row = await tx.cotacaoEnvio.update({ where: { id }, data: { status: "CANCELADA", cancelamentoMotivo: motivo, canceladaEm: new Date(), canceladaPorId: req.usuario.id } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: id, statusAnterior: atual.status, statusNovo: row.status, usuarioId: req.usuario.id, cotacaoEnvioId: id, observacao: motivo } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CANCELAR", entidadeTipo: "CotacaoEnvio", entidadeId: id, valoresAntes: { status: atual.status }, valoresNovos: { status: row.status, motivo, canceladaEm: row.canceladaEm }, cotacaoEnvioId: id });
      return row;
    });
    res.json(result);
  } catch (e) { fail(res, e); }
});

router.delete("/cotacoes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id }, include: { obra: true } });
    assertObraAccess(req.usuario, current.obraId);
    if (current.status !== "RASCUNHO") throw new Error("Somente cotaÃ§Ãµes em rascunho podem ser excluÃ­das.");
    const [respostas, compras, historicos, auditorias] = await Promise.all([
      prisma.cotacaoResposta.count({ where: { cotacaoEnvioId: id } }), prisma.compra.count({ where: { cotacaoEnvioId: id } }),
      prisma.historicoStatus.count({ where: { cotacaoEnvioId: id } }), prisma.auditoria.count({ where: { cotacaoEnvioId: id } }),
    ]);
    if (respostas || compras || historicos || auditorias) throw new Error("A cotaÃ§Ã£o possui histÃ³rico ou vÃ­nculos e nÃ£o pode ser excluÃ­da.");
    await prisma.$transaction(async tx => {
      await tx.cotacaoEnvioFornecedor.deleteMany({ where: { cotacaoEnvioId: id } });
      await tx.cotacaoEnvioItem.deleteMany({ where: { cotacaoEnvioId: id } });
      await tx.cotacaoEnvio.delete({ where: { id } });
    });
    res.status(204).send();
  } catch (e) { fail(res, e); }
});

router.get("/cotacoes/:id/comparativo", async (req, res) => {
  try {
    const cotacao = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(req.params.id) }, include: { itens: { include: { produto: true, aplicacao: true, ofertas: { include: { resposta: { include: { fornecedor: true } } } } } } } });
    assertObraAccess(req.usuario, cotacao.obraId);
    res.json(cotacao.itens.map(item => ({ itemSolicitadoId: item.id, produto: item.produto.nome, unidade: item.unidade, quantidadeSolicitada: item.quantidadeSolicitada, aplicacao: item.aplicacao?.nome || null, ofertas: item.ofertas.map(o => ({ fornecedor: o.resposta.fornecedor.nome, status: o.indisponivel ? "INDISPONIVEL" : o.status, quantidade: o.quantidadeOfertada, valorUnitario: o.valorUnitario, total: Number(o.quantidadeOfertada) * Number(o.valorUnitario), adicional: o.adicional })) })));
  } catch (e) { fail(res, e); }
});

router.get("/compras", async (req, res) => {
  try {
    res.json(await prisma.compra.findMany({
      where: {
        ...obraScope(req.usuario),
        ...(isAdminUser(req.usuario) && req.query.obraId ? { obraId: Number(req.query.obraId) } : {}),
        status: req.query.status || undefined,
        dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(req.query.ate) : undefined } : undefined,
      },
      include: {
        obra: true,
        cotacao: true,
        selecoes: { include: { oferta: { include: { resposta: { include: { fornecedor: true } }, produto: true, itemSolicitado: { include: { aplicacao: true } } } }, aprovador: { select: { nome: true } } } },
        pedidos: {
          include: {
            fornecedor: true,
            itens: { include: { recebimentos: true, selecao: { include: { oferta: { include: { produto: true } } } } } },
            notasFiscais: true,
          },
        },
      },
      orderBy: { dataCriacao: "desc" },
    }));
  } catch (e) { fail(res, e); }
});

router.post("/compras/:id/cancelar", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const compraId = Number(req.params.id);
    const observacaoCancelamento = String(req.body.observacaoCancelamento || "").trim();
    if (!observacaoCancelamento) throw new Error("Informe a observaÃ§Ã£o do cancelamento.");
    const result = await prisma.$transaction(async tx => {
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
      assertObraAccess(req.usuario, compra.obraId);
      if (compra.status === "CANCELADA") throw new Error("Esta compra jÃ¡ estÃ¡ cancelada.");
      const atualizada = await tx.compra.update({ where: { id: compraId }, data: { status: "CANCELADA", observacaoCancelamento } });
      const pedidos = await tx.pedidoCompra.findMany({ where: { compraId } });
      await tx.pedidoCompra.updateMany({ where: { compraId, status: { not: "CANCELADO" } }, data: { status: "CANCELADO" } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "Compra", entidadeId: compraId, statusAnterior: compra.status, statusNovo: "CANCELADA", usuarioId: req.usuario.id, compraId, observacao: observacaoCancelamento } });
      for (const pedido of pedidos) if (pedido.status !== "CANCELADO") await tx.historicoStatus.create({ data: { entidadeTipo: "PedidoCompra", entidadeId: pedido.id, statusAnterior: pedido.status, statusNovo: "CANCELADO", usuarioId: req.usuario.id, pedidoCompraId: pedido.id, observacao: observacaoCancelamento } });
      return atualizada;
    });
    res.json(result);
  } catch (e) { fail(res, e); }
});

router.delete("/compras/:id", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const compraId = Number(req.params.id);
    await prisma.$transaction(async tx => {
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
      assertObraAccess(req.usuario, compra.obraId);
      if (compra.status !== "CANCELADA") throw new Error("A compra precisa estar cancelada antes de ser apagada.");
      const pedidos = await tx.pedidoCompra.findMany({ where: { compraId }, select: { id: true } });
      const pedidoIds = pedidos.map(pedido => pedido.id);
      const itensPedido = pedidoIds.length ? await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: { in: pedidoIds } }, select: { id: true } }) : [];
      const itemIds = itensPedido.map(item => item.id);
      await tx.historicoStatus.deleteMany({ where: { OR: [{ compraId }, { pedidoCompraId: { in: pedidoIds } }] } });
      if (itemIds.length) await tx.recebimentoItem.deleteMany({ where: { pedidoCompraItemId: { in: itemIds } } });
      if (pedidoIds.length) {
        await tx.notaFiscal.deleteMany({ where: { pedidoCompraId: { in: pedidoIds } } });
        await tx.pedidoCompraItem.deleteMany({ where: { pedidoCompraId: { in: pedidoIds } } });
        await tx.pedidoCompra.deleteMany({ where: { id: { in: pedidoIds } } });
      }
      await tx.selecaoCompraItem.deleteMany({ where: { compraId } });
      await tx.compra.delete({ where: { id: compraId } });
    });
    res.status(204).send();
  } catch (e) { fail(res, e); }
});

router.post("/cotacoes/:id/enviar", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.cotacaoEnvio.findUnique({ where: { id }, include: { obra: true, itens: { include: { produto: true, aplicacao: true } }, fornecedores: { include: { fornecedor: true } } } });
    if (!c || !c.fornecedores.length) throw new Error("CotaÃ§Ã£o nÃ£o encontrada ou sem fornecedores.");
    assertObraAccess(req.usuario, c.obraId);
    if (!["RASCUNHO", "ENVIADA", "EM_ANDAMENTO"].includes(c.status)) throw new Error("Esta cotaÃ§Ã£o nÃ£o pode ser enviada no estado atual.");
    const resultados = await Promise.all(c.fornecedores.map(async p => {
      const aplicacoes = [...new Set(c.itens.map(item => item.aplicacao?.nome).filter(Boolean))];
      const descricaoAplicacoes = aplicacoes.length ? aplicacoes.join(", ") : "Todas as aplica\u00e7\u00f5es";
      const dataSolicitacao = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(c.dataCriacao);
      const mensagem = [
        "Ol\u00e1!",
        "",
        "*Nova solicita\u00e7\u00e3o de cota\u00e7\u00e3o*",
        "",
        "Informamos que h\u00e1 uma nova solicita\u00e7\u00e3o de cota\u00e7\u00e3o dispon\u00edvel.",
        "",
        "*Cota\u00e7\u00e3o n\u00ba:* " + c.id,
        "*Data da solicita\u00e7\u00e3o:* " + dataSolicitacao,
        "*Obra:* " + c.obra.nome,
        "",
        "*Produtos solicitados:*",
        ...c.itens.map(item => "* " + item.produto.nome + ": " + item.quantidadeSolicitada + " " + item.unidade),
        "",
        "*Aplica\u00e7\u00f5es:*",
        descricaoAplicacoes,
        "",
        "*Observa\u00e7\u00f5es:*",
        c.observacao || "Nenhuma.",
        "",
        "Por gentileza, priorize o envio da proposta por escrito ou em formato PDF.",
        "",
        "Aguardamos seu retorno!",
      ].join("\n");
      let status = "ENVIADO", erro = null, identificadorExterno = null;
      try { ({ identificadorExterno } = await whatsapp.enviar({ telefone: p.fornecedor.telefone, mensagem, idempotencia: `cotacao-${c.id}-fornecedor-${p.fornecedorId}` })); }
      catch (e) { status = "FALHOU"; erro = e.message; }
      await prisma.$transaction([prisma.cotacaoEnvioFornecedor.update({ where: { id: p.id }, data: { statusEnvio: status, dataEnvio: status === "ENVIADO" ? new Date() : undefined, erro, identificadorExterno, telefone: p.fornecedor.telefone } }), prisma.historicoEnvioMensagem.create({ data: { cotacaoEnvioFornecedorId: p.id, telefone: p.fornecedor.telefone || "", mensagem, status, erro, identificadorExterno, usuarioId: req.usuario.id } })]);
      return { fornecedorId: p.fornecedorId, status, erro };
    }));
    const status = resultados.some(r => r.status === "ENVIADO") ? (c.status === "RASCUNHO" ? "ENVIADA" : c.status) : c.status;
    if (status !== c.status) {
      validarTransicaoCotacao(c.status, status);
      await prisma.$transaction(async tx => {
        await tx.cotacaoEnvio.update({ where: { id }, data: { status } });
        await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: id, statusAnterior: c.status, statusNovo: status, usuarioId: req.usuario.id, cotacaoEnvioId: id } });
        await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ENVIAR", entidadeTipo: "CotacaoEnvio", entidadeId: id, valoresAntes: { status: c.status }, valoresNovos: { status }, detalhes: { resultados }, cotacaoEnvioId: id });
      });
    }
    res.json(resultados);
  } catch (e) { fail(res, e); }
});

router.post("/respostas", async (req, res) => {
  try {
    const { cotacaoEnvioId, fornecedorId, observacao, itens = [] } = req.body;
    const ofertas = itens.map(i => {
      const quantidade = Number(i.quantidadeOfertada ?? 0), valor = Number(i.valorUnitario ?? 0), indisponivel = Boolean(i.indisponivel);
      if (!Number.isFinite(quantidade) || quantidade < 0 || !Number.isFinite(valor) || valor < 0 || (indisponivel && (quantidade !== 0 || valor !== 0)) || (!indisponivel && quantidade === 0)) throw new Error("Oferta deve ter quantidades e valores nÃ£o negativos; indisponÃ­veis devem usar zero e ofertas disponÃ­veis devem ter quantidade positiva.");
      if (!i.cotacaoEnvioItemId && !i.adicional) throw new Error("Itens fora da solicitaÃ§Ã£o devem ser marcados como adicionais.");
      return { cotacaoEnvioItemId: i.cotacaoEnvioItemId ? Number(i.cotacaoEnvioItemId) : null, produtoId: Number(i.produtoId), quantidadeOfertada: quantidade, valorUnitario: valor, indisponivel, adicional: Boolean(i.adicional), observacao: i.observacao };
    });
    if (ofertas.some(i => i.cotacaoEnvioItemId && i.adicional)) throw new Error("Uma oferta adicional nÃ£o pode estar vinculada a um item solicitado.");
    const solicitados = await prisma.cotacaoEnvioItem.findMany({ where: { id: { in: ofertas.map(i => i.cotacaoEnvioItemId).filter(Boolean) } }, include: { produto: true } });
    if (solicitados.some(item => item.cotacaoEnvioId !== Number(cotacaoEnvioId))) throw new Error("Item solicitado nÃ£o pertence Ã  cotaÃ§Ã£o.");
    if (ofertas.some(i => i.cotacaoEnvioItemId && solicitados.find(item => item.id === i.cotacaoEnvioItemId)?.produtoId !== i.produtoId)) throw new Error("O produto ofertado deve corresponder ao produto solicitado.");
    if (!await prisma.cotacaoEnvioFornecedor.findUnique({ where: { cotacaoEnvioId_fornecedorId: { cotacaoEnvioId: Number(cotacaoEnvioId), fornecedorId: Number(fornecedorId) } } })) throw new Error("O fornecedor nÃ£o foi selecionado para esta cotaÃ§Ã£o.");
    const quote = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(cotacaoEnvioId) } });
    assertObraAccess(req.usuario, quote.obraId);
    const resposta = await prisma.$transaction(async tx => {
      const row = await tx.cotacaoResposta.create({ data: { cotacaoEnvioId: Number(cotacaoEnvioId), fornecedorId: Number(fornecedorId), usuarioPreenchimentoId: req.usuario.id, observacao, itens: { create: ofertas } }, include: { itens: true, fornecedor: true } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CRIAR", entidadeTipo: "CotacaoResposta", entidadeId: row.id, valoresNovos: row, cotacaoEnvioId: Number(cotacaoEnvioId) });
      return row;
    });
    res.status(201).json(resposta);
  } catch (e) { fail(res, e); }
});

router.patch("/respostas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.cotacaoResposta.findUniqueOrThrow({ where: { id }, include: { itens: { include: { selecoes: true } }, cotacao: true } });
    assertObraAccess(req.usuario, current.cotacao.obraId);
    if (!["PREENCHIMENTO", "ENCAMINHADA"].includes(current.status)) throw new Error("Esta resposta nÃ£o pode ser alterada no estado atual.");
    if (current.itens.some(item => item.selecoes.some(selection => selection.status === "APROVADA"))) throw new Error("A resposta contÃ©m ofertas vinculadas a compra aprovada e nÃ£o pode ser alterada.");
    const row = await prisma.$transaction(async tx => {
      const updated = await tx.cotacaoResposta.update({ where: { id }, data: { observacao: req.body.observacao }, include: { fornecedor: true, itens: true } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ATUALIZAR", entidadeTipo: "CotacaoResposta", entidadeId: id, valoresAntes: { observacao: current.observacao }, valoresNovos: { observacao: updated.observacao }, cotacaoEnvioId: current.cotacaoEnvioId });
      return updated;
    });
    res.json(row);
  } catch (e) { fail(res, e); }
});

router.post("/respostas/:id/itens", async (req, res) => {
  try {
    const respostaId = Number(req.params.id), data = req.body;
    const resposta = await prisma.cotacaoResposta.findUniqueOrThrow({ where: { id: respostaId } });
    const quote = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: resposta.cotacaoEnvioId } });
    assertObraAccess(req.usuario, quote.obraId);
    if (resposta.status !== "PREENCHIMENTO") throw new Error("Somente rascunhos podem receber novos itens.");
    const quantidade = Number(data.quantidadeOfertada ?? 0), valor = Number(data.valorUnitario ?? 0);
    if (!Number.isFinite(quantidade) || !Number.isFinite(valor) || quantidade < 0 || valor < 0 || (data.indisponivel && (quantidade !== 0 || valor !== 0)) || (!data.indisponivel && quantidade === 0)) throw new Error("Informe quantidade e valor válidos; indisponíveis devem usar zero.");
    if (!data.cotacaoEnvioItemId && !data.adicional) throw new Error("Itens fora da solicitação devem ser identificados como adicionais.");
    const requested = data.cotacaoEnvioItemId ? await prisma.cotacaoEnvioItem.findUniqueOrThrow({ where: { id: Number(data.cotacaoEnvioItemId) } }) : null;
    if (requested && (requested.cotacaoEnvioId !== resposta.cotacaoEnvioId || requested.produtoId !== Number(data.produtoId))) throw new Error("O item e o produto devem corresponder a esta cotação.");
    const row = await prisma.$transaction(async tx => {
      const created = await tx.cotacaoRespostaItem.create({ data: { cotacaoRespostaId: respostaId, cotacaoEnvioItemId: requested?.id || null, produtoId: Number(data.produtoId), quantidadeOfertada: quantidade, valorUnitario: valor, indisponivel: Boolean(data.indisponivel), adicional: Boolean(data.adicional), observacao: data.observacao } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CRIAR", entidadeTipo: "CotacaoRespostaItem", entidadeId: created.id, valoresNovos: created, cotacaoEnvioId: resposta.cotacaoEnvioId });
      return created;
    });
    res.status(201).json(row);
  } catch (e) { fail(res, e); }
});
router.patch("/respostas/:respostaId/itens/:itemId", async (req, res) => {
  try {
    const respostaId = Number(req.params.respostaId), itemId = Number(req.params.itemId);
    const resposta = await prisma.cotacaoResposta.findUniqueOrThrow({ where: { id: respostaId } });
    const item = await prisma.cotacaoRespostaItem.findUniqueOrThrow({ where: { id: itemId } });
    const quote = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: resposta.cotacaoEnvioId } });
    assertObraAccess(req.usuario, quote.obraId);
    if (!["PREENCHIMENTO", "ENCAMINHADA"].includes(resposta.status) || item.cotacaoRespostaId !== respostaId) throw new Error("Item nÃ£o editÃ¡vel ou nÃ£o pertence Ã  resposta.");
    if (await prisma.selecaoCompraItem.count({ where: { cotacaoRespostaItemId: itemId, status: "APROVADA" } })) throw new Error("Oferta vinculada a compra aprovada nÃ£o pode ser alterada.");
    const quantidade = Number(req.body.quantidadeOfertada ?? item.quantidadeOfertada), valor = Number(req.body.valorUnitario ?? item.valorUnitario);
    if (quantidade < 0 || valor < 0 || (req.body.indisponivel && (quantidade !== 0 || valor !== 0))) throw new Error("Quantidade e valor precisam ser nÃ£o negativos; indisponÃ­veis devem usar zero.");
    const row = await prisma.$transaction(async tx => {
      const updated = await tx.cotacaoRespostaItem.update({ where: { id: itemId }, data: { ...Object.fromEntries(["cotacaoEnvioItemId", "produtoId", "quantidadeOfertada", "valorUnitario", "indisponivel", "adicional", "observacao"].filter(k => req.body[k] !== undefined).map(k => [k, ["cotacaoEnvioItemId", "produtoId"].includes(k) ? Number(req.body[k]) : req.body[k]])), quantidadeOfertada: quantidade, valorUnitario: valor } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ATUALIZAR", entidadeTipo: "CotacaoRespostaItem", entidadeId: itemId, valoresAntes: item, valoresNovos: updated, cotacaoEnvioId: resposta.cotacaoEnvioId });
      return updated;
    });
    res.json(row);
  } catch (e) { fail(res, e); }
});

router.delete("/respostas/:respostaId/itens/:itemId", async (req, res) => {
  try {
    const respostaId = Number(req.params.respostaId), itemId = Number(req.params.itemId);
    const resposta = await prisma.cotacaoResposta.findUniqueOrThrow({ where: { id: respostaId } });
    const item = await prisma.cotacaoRespostaItem.findUniqueOrThrow({ where: { id: itemId } });
    const quote = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: resposta.cotacaoEnvioId } });
    assertObraAccess(req.usuario, quote.obraId);
    if (!["PREENCHIMENTO", "ENCAMINHADA"].includes(resposta.status) || item.cotacaoRespostaId !== respostaId) throw new Error("Item não removível ou não pertence à resposta.");
    if (await prisma.selecaoCompraItem.count({ where: { cotacaoRespostaItemId: itemId, status: "APROVADA" } })) throw new Error("Oferta vinculada a compra aprovada não pode ser removida.");
    await prisma.$transaction(async tx => {
      await tx.cotacaoRespostaItem.delete({ where: { id: itemId } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "EXCLUIR", entidadeTipo: "CotacaoRespostaItem", entidadeId: itemId, valoresAntes: item, cotacaoEnvioId: resposta.cotacaoEnvioId });
    });
    res.status(204).send();
  } catch (e) { fail(res, e); }
});
router.post("/respostas/:id/encaminhar", async (req, res) => {
  try {
    const respostaId = Number(req.params.id);
    const current = await prisma.cotacaoResposta.findUniqueOrThrow({ where: { id: respostaId }, include: { fornecedor: true, cotacao: { include: { obra: true } }, itens: { include: { produto: true } } } });
    assertObraAccess(req.usuario, current.cotacao.obraId);
    if (current.status !== "PREENCHIMENTO") throw new Error("Esta resposta jÃ¡ foi encaminhada.");
    const ids = [...new Set((req.body.destinatarioIds || []).map(Number))];
    if (!ids.length || ids.some(id => !Number.isInteger(id))) throw new Error("Selecione ao menos um destinatÃ¡rio para enviar a resposta.");
    const destinatarios = await prisma.whatsAppDestinatario.findMany({ where: { id: { in: ids }, usuarioId: req.usuario.id, ativo: true }, orderBy: { nome: "asc" } });
    if (destinatarios.length !== ids.length) throw new Error("Um ou mais destinatÃ¡rios nÃ£o existem, estÃ£o inativos ou nÃ£o pertencem a este usuÃ¡rio.");

    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const linhasItens = current.itens.map(item => item.indisponivel
      ? `â€¢ ${item.produto.nome}: indisponÃ­vel`
      : `â€¢ ${item.produto.nome}: ${Number(item.quantidadeOfertada)} ${item.produto.unidade} Ã— ${brl.format(Number(item.valorUnitario))} = ${brl.format(Number(item.quantidadeOfertada) * Number(item.valorUnitario))}`);
    const mensagem = [
      `Resposta da cotaÃ§Ã£o #${String(current.cotacaoEnvioId).padStart(4, "0")}`,
      `Obra: ${current.cotacao.obra.nome}`,
      `Fornecedor: ${current.fornecedor.nome}`,
      ...linhasItens,
      current.observacao ? `ObservaÃ§Ã£o: ${current.observacao}` : null,
    ].filter(Boolean).join("\n");
    const envios = await Promise.all(destinatarios.map(async destinatario => {
      try {
        const { identificadorExterno } = await whatsapp.enviar({ telefone: destinatario.identificador, mensagem });
        return { destinatario, identificadorExterno, status: "ENVIADO", erro: null };
      } catch (error) { return { destinatario, status: "FALHOU", erro: error.message, identificadorExterno: null }; }
    }));
    const updated = await prisma.$transaction(async tx => {
      await tx.historicoEnvioResposta.createMany({ data: envios.map(item => ({ cotacaoRespostaId: respostaId, usuarioId: req.usuario.id, destinatarioId: item.destinatario.id, destinatarioNome: item.destinatario.nome, telefone: item.destinatario.identificador, mensagem, status: item.status, erro: item.erro, identificadorExterno: item.identificadorExterno })) });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ENVIAR", entidadeTipo: "CotacaoResposta", entidadeId: respostaId, valoresNovos: { destinatarios: envios.map(item => ({ id: item.destinatario.id, status: item.status, erro: item.erro })) }, cotacaoEnvioId: current.cotacaoEnvioId });
      if (!envios.some(item => item.status === "ENVIADO")) return null;
      const resposta = await tx.cotacaoResposta.update({ where: { id: respostaId }, data: { status: "ENCAMINHADA", dataResposta: new Date() }, include: { cotacao: true } });
      const quote = await tx.cotacaoEnvio.findUniqueOrThrow({ where: { id: resposta.cotacaoEnvioId } });
      if (quote.status === "RASCUNHO") {
        const enviada = validarTransicaoCotacao(quote.status, "ENVIADA");
        await tx.cotacaoEnvio.update({ where: { id: quote.id }, data: { status: enviada } });
        await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: quote.id, statusAnterior: quote.status, statusNovo: enviada, usuarioId: req.usuario.id, cotacaoEnvioId: quote.id } });
        quote.status = enviada;
      }
      if (quote.status === "ENVIADA") {
        const emAndamento = validarTransicaoCotacao(quote.status, "EM_ANDAMENTO");
        await tx.cotacaoEnvio.update({ where: { id: quote.id }, data: { status: emAndamento } });
        await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: quote.id, statusAnterior: quote.status, statusNovo: emAndamento, usuarioId: req.usuario.id, cotacaoEnvioId: quote.id } });
      }
      return resposta;
    });
    const enviados = envios.filter(item => item.status === "ENVIADO");
    const falhas = envios.filter(item => item.status === "FALHOU");
    if (!updated) return res.status(502).json({ erro: `NÃ£o foi possÃ­vel enviar a resposta por WhatsApp: ${falhas.map(item => `${item.destinatario.nome}: ${item.erro}`).join("; ")}` });
    res.json({ resposta: updated, whatsapp: { enviados: enviados.map(item => item.destinatario.nome), falhas: falhas.map(item => ({ nome: item.destinatario.nome, erro: item.erro })) } });
  } catch (e) { fail(res, e); }
});

router.patch("/compras/ofertas/:id/quantidade-ofertada", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const quantidadeOfertada = Number(req.body.quantidadeOfertada);
    if (!Number.isFinite(quantidadeOfertada) || quantidadeOfertada <= 0) throw new Error("A quantidade ofertada deve ser maior que zero.");

    const oferta = await prisma.cotacaoRespostaItem.findUniqueOrThrow({ where: { id }, include: { resposta: true } });
    if (oferta.resposta.status !== "ENCAMINHADA" || oferta.status !== "PENDENTE" || oferta.indisponivel) {
      throw new Error("Somente ofertas encaminhadas e ainda sem decisÃ£o podem ser editadas.");
    }

    const aprovada = await prisma.selecaoCompraItem.aggregate({ where: { status: "APROVADA", cotacaoRespostaItemId: id }, _sum: { quantidadeAprovada: true } });
    if (Number(aprovada._sum.quantidadeAprovada || 0) > quantidadeOfertada) throw new Error("A quantidade ofertada nÃ£o pode ficar abaixo da quantidade jÃ¡ aprovada.");

    res.json(await prisma.cotacaoRespostaItem.update({ where: { id }, data: { quantidadeOfertada } }));
  } catch (e) { fail(res, e); }
});

router.post("/compras/aprovar", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const { cotacaoEnvioId, itens } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { nome: true, email: true } });
    if (!Array.isArray(itens) || !itens.length) throw new Error("Informe itens para decisÃ£o.");
    const compra = await prisma.$transaction(async tx => {
      const cotacao = await tx.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(cotacaoEnvioId) }, include: { itens: true, fornecedores: true, respostas: { include: { itens: true } } } });
      assertObraAccess(req.usuario, cotacao.obraId);
      if (!["EM_ANDAMENTO", "ENVIADA"].includes(cotacao.status)) throw new Error("A cotaÃ§Ã£o nÃ£o estÃ¡ disponÃ­vel para anÃ¡lise de compra.");
      const c = await tx.compra.upsert({ where: { cotacaoEnvioId: cotacao.id }, update: {}, create: { obraId: cotacao.obraId, cotacaoEnvioId: cotacao.id } });
      const seen = new Set();
      for (const decision of itens) {
        if (seen.has(String(decision.ofertaId))) throw new Error("Cada oferta deve aparecer uma Ãºnica vez por decisÃ£o.");
        seen.add(String(decision.ofertaId));
        const oferta = await tx.cotacaoRespostaItem.findUniqueOrThrow({ where: { id: Number(decision.ofertaId) }, include: { resposta: true } });
        if (oferta.resposta.cotacaoEnvioId !== cotacao.id) throw new Error("Oferta nÃ£o pertence Ã  cotaÃ§Ã£o informada.");
        if (oferta.cotacaoEnvioItemId && !cotacao.itens.some(i => i.id === oferta.cotacaoEnvioItemId)) throw new Error("Item solicitado nÃ£o pertence Ã  cotaÃ§Ã£o.");
        const qtd = Number(decision.quantidadeAprovada || 0), unit = Number(decision.valorUnitarioAprovado ?? oferta.valorUnitario);
        if (decision.status === "REJEITADA") {
          await tx.selecaoCompraItem.create({ data: { compraId: c.id, cotacaoRespostaItemId: oferta.id, quantidadeAprovada: 0, valorUnitarioAprovado: unit, aprovadorId: req.usuario.id, status: "REJEITADA" } });
          await tx.cotacaoRespostaItem.update({ where: { id: oferta.id }, data: { status: "REJEITADA" } }); continue;
        }
        if (oferta.indisponivel || qtd <= 0 || qtd > Number(oferta.quantidadeOfertada) || unit < 0) throw new Error("Quantidade ou valor aprovado invÃ¡lido.");
        const aprovadoOferta = await tx.selecaoCompraItem.aggregate({ where: { status: "APROVADA", cotacaoRespostaItemId: oferta.id }, _sum: { quantidadeAprovada: true } });
        if (Number(aprovadoOferta._sum.quantidadeAprovada || 0) + qtd > Number(oferta.quantidadeOfertada)) throw new Error("A soma aprovada excede a quantidade ofertada.");
        if (oferta.cotacaoEnvioItemId) {
          const solicitacao = cotacao.itens.find(i => i.id === oferta.cotacaoEnvioItemId);
          const anteriores = await tx.selecaoCompraItem.aggregate({ where: { status: "APROVADA", oferta: { cotacaoEnvioItemId: solicitacao.id } }, _sum: { quantidadeAprovada: true } });
          if (Number(anteriores._sum.quantidadeAprovada || 0) + qtd > Number(solicitacao.quantidadeSolicitada)) throw new Error("A soma aprovada excede a quantidade solicitada.");
        }
        await tx.selecaoCompraItem.create({ data: { compraId: c.id, cotacaoRespostaItemId: oferta.id, quantidadeAprovada: qtd, valorUnitarioAprovado: unit, aprovadorId: req.usuario.id, status: "APROVADA" } });
        await tx.cotacaoRespostaItem.update({ where: { id: oferta.id }, data: { status: "APROVADA" } });
      }
      const selecoesAprovadas = await tx.selecaoCompraItem.count({ where: { compraId: c.id, status: "APROVADA" } });
      if (selecoesAprovadas > 0) {
        const novoStatus = validarTransicaoCotacao(cotacao.status, "CONCLUIDA", { compraAprovada: true });
        await tx.cotacaoEnvio.update({ where: { id: cotacao.id }, data: { status: novoStatus } });
        await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, statusAnterior: cotacao.status, statusNovo: novoStatus, usuarioId: req.usuario.id, cotacaoEnvioId: cotacao.id, observacao: `Compra ${c.id} aprovada.` } });
        await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CONCLUIR_APROVACAO", entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, valoresAntes: { status: cotacao.status }, valoresNovos: { status: novoStatus, compraId: c.id }, cotacaoEnvioId: cotacao.id, compraId: c.id });
      } else {
        const semRespostasPendentes = !respostasEstaoPendentes(cotacao.respostas, cotacao.fornecedores);
        const ofertasPendentes = await tx.cotacaoRespostaItem.count({ where: { resposta: { cotacaoEnvioId: cotacao.id }, status: "PENDENTE" } });
        if (semRespostasPendentes && ofertasPendentes === 0) {
          const novoStatus = validarTransicaoCotacao(cotacao.status, "ENCERRADA", { respostasPendentes: false });
          await tx.cotacaoResposta.updateMany({ where: { cotacaoEnvioId: cotacao.id, status: "ENCAMINHADA" }, data: { status: "ENCERRADA" } });
          await tx.cotacaoEnvio.update({ where: { id: cotacao.id }, data: { status: novoStatus } });
          await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, statusAnterior: cotacao.status, statusNovo: novoStatus, usuarioId: req.usuario.id, cotacaoEnvioId: cotacao.id, observacao: "Todas as ofertas foram rejeitadas ou encerradas." } });
        }
      }
      await tx.historicoStatus.create({ data: { entidadeTipo: "Compra", entidadeId: c.id, statusNovo: c.status, usuarioId: req.usuario.id, compraId: c.id, cotacaoEnvioId: cotacao.id } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "APROVAR_OFERTAS", entidadeTipo: "Compra", entidadeId: c.id, valoresNovos: { ofertas: itens, totalAprovado: (await tx.selecaoCompraItem.findMany({ where: { compraId: c.id, status: "APROVADA" } })).reduce((sum, row) => sum + Number(row.quantidadeAprovada) * Number(row.valorUnitarioAprovado), 0) }, cotacaoEnvioId: cotacao.id, compraId: c.id });
      return tx.compra.findUnique({ where: { id: c.id }, include: { obra: true, cotacao: true, selecoes: { include: { oferta: { include: { resposta: { include: { fornecedor: true } }, produto: true, itemSolicitado: { include: { aplicacao: true } } } }, aprovador: { select: { nome: true } } } } } });
    }, { isolationLevel: "Serializable" });
    const ofertasAprovadasAgora = new Set(itens.filter(item => item.status !== "REJEITADA").map(item => Number(item.ofertaId)));
    const aprovados = compra.selecoes.filter(selecao => selecao.status === "APROVADA" && ofertasAprovadasAgora.has(selecao.cotacaoRespostaItemId));
    const grupos = Map.groupBy(aprovados, selecao => selecao.oferta.resposta.fornecedorId);
    const dataFechamento = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const notificacoes = await Promise.all([...grupos.values()].map(async selecoes => {
      const fornecedor = selecoes[0].oferta.resposta.fornecedor;
      const aplicacoes = [...new Set(selecoes.map(selecao => selecao.oferta.itemSolicitado?.aplicacao?.nome).filter(Boolean))];
      const linhasAplicacoes = aplicacoes.length ? aplicacoes.map(nome => `* ${nome}`) : ["*Todas as aplicaÃ§Ãµes"];
      const linhasProdutos = selecoes.map(selecao => `* ${selecao.oferta.produto.nome}: ${selecao.quantidadeAprovada} ${selecao.oferta.produto.unidade}`);
      const mensagem = [
        "OlÃ¡!",
        "",
        "*Faturamento autorizado!*",
        "",
        "Informamos que o pedido foi fechado com sucesso.",
        "",
        `*Data do fechamento:* ${dataFechamento}`,
        "",
        "*Produtos:*",
        ...linhasProdutos,
        "",
        "*ObservaÃ§Ãµes:*",
        compra.cotacao.observacao || "Nenhuma.",
        "",
        "Por gentileza, solicite Ã  equipe responsÃ¡vel que inclua as seguintes informaÃ§Ãµes no *rodapÃ© da nota fiscal*: ",
        "",
        `*Obra:* ${compra.obra.nome}`,
        `*AplicaÃ§Ãµes:* ${aplicacoes.length ? aplicacoes.join(", ") : "Todas as aplicaÃ§Ãµes"}`,
        "",
        "Atenciosamente,",
        usuario?.nome || "Equipe de compras",
        "Construtora Gil Ferreira LTDA",
        usuario?.email || "",
        "",
        "Agradecemos pela parceria!",
      ].join("\n");

      try {
        const { identificadorExterno } = await whatsapp.enviar({ telefone: fornecedor.telefone, mensagem });
        return { fornecedorId: fornecedor.id, status: "ENVIADO", identificadorExterno };
      } catch (erro) {
        return { fornecedorId: fornecedor.id, status: "FALHOU", erro: erro.message };
      }
    }));
    res.status(201).json({ compra, notificacoes });
  } catch (e) { fail(res, e); }
});

router.post("/compras/:id/pedidos", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const compraId = Number(req.params.id);
    const rows = await prisma.$transaction(async tx => {
      const aprovados = await tx.selecaoCompraItem.findMany({ where: { compraId, status: "APROVADA" }, include: { oferta: { include: { resposta: true } } } });
      if (!aprovados.length) throw new Error("A compra nÃ£o possui itens aprovados.");
      const grupos = Map.groupBy(aprovados, s => String(s.oferta.resposta.fornecedorId));
      for (const [fornecedorId, selecoes] of grupos) {
        const pedido = await tx.pedidoCompra.upsert({ where: { compraId_fornecedorId: { compraId, fornecedorId: Number(fornecedorId) } }, update: {}, create: { compraId, fornecedorId: Number(fornecedorId) } });
        for (const s of selecoes) await tx.pedidoCompraItem.upsert({ where: { selecaoCompraItemId: s.id }, update: {}, create: { pedidoCompraId: pedido.id, selecaoCompraItemId: s.id, quantidade: s.quantidadeAprovada, valorUnitario: s.valorUnitarioAprovado } });
      }
      await tx.compra.update({ where: { id: compraId }, data: { status: "PEDIDOS_ABERTOS" } });
      return tx.pedidoCompra.findMany({ where: { compraId }, include: { fornecedor: true, itens: true } });
    });
    res.status(201).json(rows);
  } catch (e) { fail(res, e); }
});

router.post("/compras/:id/encerrar-analise", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const compraId = Number(req.params.id);
    const compra = await prisma.$transaction(async tx => {
      const current = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: { cotacao: { include: { fornecedores: true, respostas: true } } } });
      assertObraAccess(req.usuario, current.obraId);
      if (await tx.selecaoCompraItem.count({ where: { compraId, status: "APROVADA" } })) throw new Error("A cotaÃ§Ã£o jÃ¡ possui itens aprovados e nÃ£o pode ser encerrada sem compra.");
      if (respostasEstaoPendentes(current.cotacao.respostas, current.cotacao.fornecedores)) throw new Error("Existem respostas de fornecedores pendentes.");
      if (await tx.cotacaoRespostaItem.count({ where: { resposta: { cotacaoEnvioId: current.cotacaoEnvioId }, status: "PENDENTE" } })) throw new Error("Existem ofertas pendentes de anÃ¡lise.");
      const status = validarTransicaoCotacao(current.cotacao.status, "ENCERRADA", { respostasPendentes: false });
      await tx.cotacaoResposta.updateMany({ where: { cotacaoEnvioId: current.cotacaoEnvioId, status: "ENCAMINHADA" }, data: { status: "ENCERRADA" } });
      const cotacao = await tx.cotacaoEnvio.update({ where: { id: current.cotacaoEnvioId }, data: { status } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, statusAnterior: current.cotacao.status, statusNovo: cotacao.status, usuarioId: req.usuario.id, cotacaoEnvioId: cotacao.id } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ENCERRAR", entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, valoresAntes: { status: current.cotacao.status }, valoresNovos: { status: cotacao.status }, cotacaoEnvioId: cotacao.id });
      return cotacao;
    });
    res.json(compra);
  } catch (e) { fail(res, e); }
});

router.patch("/pedidos/:id/confirmar", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.$transaction(async tx => {
      const current = await tx.pedidoCompra.findUniqueOrThrow({ where: { id }, include: { compra: true } });
      assertObraAccess(req.usuario, current.compra.obraId);
      const updated = await tx.pedidoCompra.update({ where: { id }, data: { status: "CONFIRMADO", dataPedido: new Date() } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "PedidoCompra", entidadeId: id, statusAnterior: current.status, statusNovo: "CONFIRMADO", usuarioId: req.usuario.id, pedidoCompraId: id } });
      await tx.compra.update({ where: { id: current.compraId }, data: { status: "EM_ANDAMENTO" } });
      return updated;
    });
    res.json(pedido);
  }
  catch (e) { fail(res, e); }
});

router.post("/pedidos/:id/notas-fiscais", async (req, res) => {
  try {
    const { numero, dataEmissao, valorTotal, arquivoReferencia } = req.body;
    if (Number(valorTotal) < 0) throw new Error("Valor nÃ£o pode ser negativo.");
    const result = await prisma.$transaction(async tx => {
      const pedido = await tx.pedidoCompra.findUniqueOrThrow({ where: { id: Number(req.params.id) }, include: { compra: true } });
      assertObraAccess(req.usuario, pedido.compra.obraId);
      const notaFiscal = await tx.notaFiscal.create({ data: { pedidoCompraId: pedido.id, numero, dataEmissao: new Date(dataEmissao), valorTotal: Number(valorTotal), arquivoReferencia } });
      await concluirCompraSePronta(tx, pedido.compraId, req.usuario.id);
      return notaFiscal;
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});

router.post("/pedidos/itens/:id/recebimentos", async (req, res) => {
  try {
    const itemId = Number(req.params.id), quantidadeRecebida = Number(req.body.quantidadeRecebida);
    const result = await prisma.$transaction(async tx => {
      const item = await tx.pedidoCompraItem.findUniqueOrThrow({ where: { id: itemId }, include: { pedido: { include: { compra: true } } } });
      assertObraAccess(req.usuario, item.pedido.compra.obraId);
      const anterior = await tx.recebimentoItem.aggregate({ where: { pedidoCompraItemId: itemId }, _sum: { quantidadeRecebida: true } });
      if (quantidadeRecebida <= 0 || Number(anterior._sum.quantidadeRecebida || 0) + quantidadeRecebida > Number(item.quantidade)) throw new Error("Quantidade recebida invÃ¡lida ou acima do saldo do pedido.");
      const recebimento = await tx.recebimentoItem.create({ data: { pedidoCompraItemId: itemId, quantidadeRecebida, usuarioId: req.usuario.id, observacao: req.body.observacao } });
      const total = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: item.pedidoCompraId }, include: { recebimentos: true } });
      const concluido = total.every(i => i.recebimentos.reduce((s, r) => s + Number(r.quantidadeRecebida), 0) >= Number(i.quantidade));
      const iniciado = total.some(i => i.recebimentos.length);
      await tx.pedidoCompra.update({ where: { id: item.pedidoCompraId }, data: { status: concluido ? "RECEBIDO" : iniciado ? "PARCIALMENTE_RECEBIDO" : item.pedido.status } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "RecebimentoItem", entidadeId: recebimento.id, statusNovo: concluido ? "RECEBIDO" : "PARCIALMENTE_RECEBIDO", usuarioId: req.usuario.id, pedidoCompraId: item.pedidoCompraId, observacao: `Recebimento de ${quantidadeRecebida}` } });
      await concluirCompraSePronta(tx, item.pedido.compraId, req.usuario.id);
      return recebimento;
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});

router.post("/pedidos/:id/recebimentos", async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const { itens, dataRecebimento, observacao } = req.body;
    if (!Array.isArray(itens) || !itens.length) throw new Error("Informe os produtos recebidos.");
    const data = dataRecebimento ? new Date(`${dataRecebimento}T12:00:00`) : new Date();
    if (Number.isNaN(data.getTime())) throw new Error("Informe uma data de recebimento vÃ¡lida.");

    const result = await prisma.$transaction(async tx => {
      const pedido = await tx.pedidoCompra.findUniqueOrThrow({ where: { id: pedidoId }, include: { compra: true, itens: { include: { recebimentos: true } } } });
      assertObraAccess(req.usuario, pedido.compra.obraId);
      if (pedido.status === "CANCELADO") throw new Error("NÃ£o Ã© possÃ­vel registrar recebimento de um pedido cancelado.");
      const ids = itens.map(item => Number(item.pedidoCompraItemId));
      if (new Set(ids).size !== ids.length || ids.some(id => !pedido.itens.some(item => item.id === id))) throw new Error("HÃ¡ produtos invÃ¡lidos ou repetidos neste recebimento.");

      const registros = [];
      for (const entrada of itens) {
        const item = pedido.itens.find(row => row.id === Number(entrada.pedidoCompraItemId));
        const quantidade = Number(entrada.quantidadeRecebida);
        const jaRecebida = item.recebimentos.reduce((sum, registro) => sum + Number(registro.quantidadeRecebida), 0);
        if (!Number.isFinite(quantidade) || quantidade < 0 || jaRecebida + quantidade > Number(item.quantidade)) throw new Error("Uma das quantidades recebidas Ã© invÃ¡lida ou maior que o saldo do pedido.");
        const registro = await tx.recebimentoItem.create({ data: { pedidoCompraItemId: item.id, quantidadeRecebida: quantidade, dataRecebimento: data, usuarioId: req.usuario.id, observacao } });
        registros.push(registro);
      }

      const atualizados = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: pedidoId }, include: { recebimentos: true } });
      const concluido = atualizados.every(item => item.recebimentos.reduce((sum, registro) => sum + Number(registro.quantidadeRecebida), 0) >= Number(item.quantidade));
      const iniciado = atualizados.some(item => item.recebimentos.length > 0);
      const status = concluido ? "RECEBIDO" : iniciado ? "PARCIALMENTE_RECEBIDO" : pedido.status;
      const pedidoAtualizado = await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { status } });
      for (const registro of registros) await tx.historicoStatus.create({ data: { entidadeTipo: "RecebimentoItem", entidadeId: registro.id, statusNovo: status, usuarioId: req.usuario.id, pedidoCompraId: pedidoId, observacao: `Recebimento de ${registro.quantidadeRecebida}${observacao ? ` Â· ${observacao}` : ""}` } });
      await concluirCompraSePronta(tx, pedido.compraId, req.usuario.id);
      return { pedido: pedidoAtualizado, recebimentos: registros };
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});

router.get("/relatorios/gastos", async (req, res) => {
  try {
    const purchases = await prisma.pedidoCompra.findMany({ where: { status: { not: "CANCELADO" }, compra: { ...obraScope(req.usuario), ...(isAdminUser(req.usuario) && req.query.obraId ? { obraId: Number(req.query.obraId) } : {}), dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(req.query.ate) : undefined } : undefined } }, include: { fornecedor: true, compra: { include: { obra: true } }, itens: { include: { selecao: { include: { oferta: { include: { produto: true } } } } } } } });
    const linhas = purchases.flatMap(p => p.itens.map(i => ({ obra: p.compra.obra.nome, fornecedor: p.fornecedor.nome, produto: i.selecao.oferta.produto.nome, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario), total: Number(i.quantidade) * Number(i.valorUnitario), data: p.compra.dataCriacao.toISOString() })));
    const chave = req.query.agruparPor === "fornecedor" ? "fornecedor" : req.query.agruparPor === "produto" ? "produto" : "obra";
    const resumo = Object.entries(Object.groupBy(linhas, x => x[chave])).map(([nome, ls]) => ({ nome, total: ls.reduce((s, x) => s + x.total, 0), quantidade: ls.reduce((s, x) => s + x.quantidade, 0) }));
    if (req.query.formato === "csv") {
      const csv = ["obra,fornecedor,produto,quantidade,valorUnitario,total,data", ...linhas.map(x => [x.obra,x.fornecedor,x.produto,x.quantidade,x.valorUnitario,x.total,x.data].map(v => `"${String(v).replaceAll('"','""')}"`).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=relatorio-gastos.csv"); return res.send(`\ufeff${csv}`);
    }
    if (req.query.formato === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=relatorio-gastos.pdf");
      const pdf = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
      pdf.pipe(res); pdf.fontSize(18).text("RelatÃ³rio de gastos", { align: "center" });
      pdf.moveDown().fontSize(9).text(`Filtros: obra=${req.query.obraId || "todas"}; perÃ­odo=${req.query.de || "inÃ­cio"} atÃ© ${req.query.ate || "hoje"}; agrupamento=${chave}`);
      pdf.moveDown().fontSize(10).text("Obra | Fornecedor | Produto | Quantidade | UnitÃ¡rio | Total | Data");
      for (const x of linhas) {
        if (pdf.y > 520) pdf.addPage();
        pdf.fontSize(8).text(`${x.obra} | ${x.fornecedor} | ${x.produto} | ${x.quantidade} | R$ ${x.valorUnitario.toFixed(2)} | R$ ${x.total.toFixed(2)} | ${x.data.slice(0,10)}`);
      }
      pdf.end(); return;
    }
    res.json({ filtros: req.query, resumo, linhas });
  } catch (e) { fail(res, e); }
});

router.get("/relatorios/cotacoes", async (req, res) => {
  try {
    const cotacoes = await prisma.cotacaoEnvio.findMany({ where: { ...obraScope(req.usuario), ...(isAdminUser(req.usuario) && req.query.obraId ? { obraId: Number(req.query.obraId) } : {}), dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(req.query.ate) : undefined } : undefined, itens: req.query.produtoId ? { some: { produtoId: Number(req.query.produtoId) } } : undefined }, include: { obra: true, itens: { include: { produto: true, ofertas: { include: { resposta: { include: { fornecedor: true } } } } } }, respostas: { include: { itens: true } } }, orderBy: { dataCriacao: "desc" }, take: Math.min(Number(req.query.limite) || 500, 1000) });
    const rows = cotacoes.flatMap(c => c.itens.flatMap(i => i.ofertas.map(o => ({ cotacaoId: c.id, obra: c.obra.nome, produto: i.produto.nome, unidade: i.unidade, solicitada: Number(i.quantidadeSolicitada), fornecedor: o.resposta.fornecedor.nome, ofertada: Number(o.quantidadeOfertada), valorUnitario: Number(o.valorUnitario), total: Number(o.quantidadeOfertada) * Number(o.valorUnitario), disponibilidade: o.indisponivel ? "indisponivel" : "disponivel" }))));
    if (req.query.formato === "csv") {
      const csv = ["cotacaoId,obra,produto,unidade,solicitada,fornecedor,ofertada,valorUnitario,total,disponibilidade", ...rows.map(x => Object.values(x).map(v => `"${String(v).replaceAll('"','""')}"`).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=relatorio-cotacoes.csv"); return res.send(`\ufeff${csv}`);
    }
    if (req.query.formato === "pdf") {
      res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", "attachment; filename=relatorio-cotacoes.pdf");
      const pdf = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" }); pdf.pipe(res); pdf.fontSize(18).text("Comparativo de cotaÃ§Ãµes", { align: "center" }); pdf.moveDown().fontSize(9).text(`Filtros: obra=${req.query.obraId || "todas"}; produto=${req.query.produtoId || "todos"}; perÃ­odo=${req.query.de || "inÃ­cio"} atÃ© ${req.query.ate || "hoje"}`); pdf.moveDown().fontSize(10).text("CotaÃ§Ã£o | Obra | Produto | Fornecedor | Qtd. solicitada | Qtd. ofertada | UnitÃ¡rio | Total | SituaÃ§Ã£o");
      for (const x of rows) { if (pdf.y > 520) pdf.addPage(); pdf.fontSize(8).text(`${x.cotacaoId} | ${x.obra} | ${x.produto} | ${x.fornecedor} | ${x.solicitada} ${x.unidade} | ${x.ofertada} | R$ ${x.valorUnitario.toFixed(2)} | R$ ${x.total.toFixed(2)} | ${x.disponibilidade}`); }
      pdf.end(); return;
    }
    res.json({ filtros: req.query, linhas: rows });
  } catch (e) { fail(res, e); }
});

router.get("/historico", async (req, res) => {
  try {
    const tipo = String(req.query.tipo || ""), id = Number(req.query.id);
    if (!tipo || !Number.isInteger(id)) throw new Error("Informe o tipo e identificador da entidade.");
    let obraId = null;
    if (tipo === "CotacaoEnvio") obraId = (await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id }, select: { obraId: true } })).obraId;
    else if (tipo === "Compra") obraId = (await prisma.compra.findUniqueOrThrow({ where: { id }, select: { obraId: true } })).obraId;
    else if (tipo === "PedidoCompra") obraId = (await prisma.pedidoCompra.findUniqueOrThrow({ where: { id }, select: { compra: { select: { obraId: true } } } })).compra.obraId;
    else if (!isAdminUser(req.usuario)) throw Object.assign(new Error("Somente administradores podem consultar este histÃ³rico."), { status: 403 });
    if (obraId != null) assertObraAccess(req.usuario, obraId);
    const [historico, auditoria] = await Promise.all([
      prisma.historicoStatus.findMany({ where: { entidadeTipo: tipo, entidadeId: id }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { dataHora: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500) }),
      prisma.auditoria.findMany({ where: { entidadeTipo: tipo, entidadeId: String(id) }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { dataHora: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500) }),
    ]);
    res.json({ status: historico, alteracoes: auditoria });
  }
  catch (e) { fail(res, e); }
});

router.get("/respostas/:id/envios", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const resposta = await prisma.cotacaoResposta.findUniqueOrThrow({ where: { id }, include: { cotacao: { select: { obraId: true } } } });
    assertObraAccess(req.usuario, resposta.cotacao.obraId);
    res.json(await prisma.historicoEnvioResposta.findMany({ where: { cotacaoRespostaId: id }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { dataHora: "desc" } }));
  } catch (e) { fail(res, e); }
});
export default router;


