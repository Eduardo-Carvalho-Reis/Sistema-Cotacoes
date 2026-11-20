import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../prisma/lib/prisma.ts";
import { WhatsAppProvider } from "../Services/whatsapp.service.js";
import { permitir, assertObraAccess, obraScope, isAdminUser } from "../middleware/auth.js";
import { registrarAuditoria } from "../Services/audit.service.js";
import { validarTransicaoCotacao, respostasEstaoPendentes } from "../Services/cotacao-state.service.js";
import { calcularStatusEntrega } from "../Services/delivery.service.js";
import { notificarUsuario, tentarNovamenteNotificacao } from "../Services/notification.service.js";
import { calcularEstatisticasPreco } from "../Services/reports.service.js";

const router = Router();
const whatsapp = new WhatsAppProvider();
const fail = (res, e) => res.status(e.status || (e.code === "P2025" ? 404 : e.code === "P2002" ? 409 : 400)).json({ erro: e.message });
const assertCotacaoNaoConcluida = cotacao => {
  if (cotacao.status === "CONCLUIDA") throw new Error("A cotação foi concluída e não permite novas ações.");
};

async function concluirCompraSePronta(tx, compraId, usuarioId) {
  const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
  if (compra.status === "CANCELADA" || compra.status === "CONCLUIDA") return;
  const pedidos = await tx.pedidoCompra.findMany({
    where: { compraId },
    include: { itens: { include: { recebimentos: true } } },
  });
  const notaFiscalAtiva = await tx.notaFiscal.count({ where: { compraId, ativa: true } });
  const todosConcluidos = pedidos.length > 0 && pedidos.every(pedido =>
    pedido.status !== "CANCELADO"
    && pedido.itens.length > 0
    && pedido.itens.every(item => item.recebimentos.reduce((sum, recebimento) => sum + Number(recebimento.quantidadeRecebida), 0) >= Number(item.quantidade))
  ) && notaFiscalAtiva > 0;
  if (!todosConcluidos) return;
  await tx.compra.update({ where: { id: compraId }, data: { status: "CONCLUIDA" } });
  await tx.historicoStatus.create({ data: {
    entidadeTipo: "Compra",
    entidadeId: compraId,
    statusAnterior: compra.status,
    statusNovo: "CONCLUIDA",
    usuarioId,
    compraId,
    observacao: "Todos os produtos foram recebidos e as notas fiscais foram lançadas.",
  } });
  await registrarAuditoria(tx, { usuarioId, operacao: "CONCLUIR_COMPRA", entidadeTipo: "Compra", entidadeId: compraId, valoresAntes: { status: compra.status }, valoresNovos: { status: "CONCLUIDA" }, compraId });
}

async function salvarNotaFiscal(tx, { compraId, pedidoCompraId, usuarioId, dados }) {
  const numero = String(dados.numero || "").trim();
  const valorTotal = Number(dados.valorTotal);
  const dataEmissao = new Date(dados.dataEmissao);
  if (!numero || !Number.isFinite(valorTotal) || valorTotal < 0 || Number.isNaN(dataEmissao.getTime())) throw new Error("Informe número, data de emissão e valor válidos para a nota fiscal.");
  const before = await tx.notaFiscal.findFirst({ where: { compraId, ativa: true } });
  const payload = { numero, dataEmissao, valorTotal, dataRegistro: new Date(), ativa: true };
  if (before) {
    await tx.historicoNotaFiscal.create({ data: { notaFiscalId: before.id, compraId, usuarioId, numero: before.numero, dataEmissao: before.dataEmissao, valorTotal: before.valorTotal, dataRegistro: before.dataRegistro } });
    const updated = await tx.notaFiscal.update({ where: { id: before.id }, data: { ...payload, pedidoCompraId } });
    await registrarAuditoria(tx, { usuarioId, operacao: "EDITAR_NOTA_FISCAL", entidadeTipo: "NotaFiscal", entidadeId: updated.id, valoresAntes: before, valoresNovos: updated, compraId });
    return updated;
  }
  const created = await tx.notaFiscal.create({ data: { ...payload, pedidoCompraId, compraId } });
  await registrarAuditoria(tx, { usuarioId, operacao: "REGISTRAR_NOTA_FISCAL", entidadeTipo: "NotaFiscal", entidadeId: created.id, valoresNovos: created, compraId });
  return created;
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
        if (!produto) throw new Error("Produto não encontrado.");
        const unidade = i.unidade || produto.unidade;
        if (unidade !== produto.unidade) throw new Error("Conversões de unidade não configuradas; use a unidade cadastrada do produto.");
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
    if (atual.status !== "RASCUNHO" || atual.respostas.length || atual.compras.length) throw new Error("Somente cotações em rascunho sem respostas ou compras podem ser editadas.");
    const payload = req.body;
    const updated = await prisma.$transaction(async tx => {
      const data = {};
      if (payload.observacao !== undefined) data.observacao = payload.observacao;
      if (payload.itens !== undefined) {
        if (!Array.isArray(payload.itens) || !payload.itens.length) throw new Error("A cotação precisa ter ao menos um item.");
        const produtos = await tx.produto.findMany({ where: { id: { in: [...new Set(payload.itens.map(i => Number(i.produtoId)))] }, ativo: true } });
        const novosItens = payload.itens.map(i => {
          const produto = produtos.find(p => p.id === Number(i.produtoId));
          const quantidade = Number(i.quantidadeSolicitada);
          if (!produto || !Number.isFinite(quantidade) || quantidade <= 0) throw new Error("Produto ou quantidade inválidos.");
          if ((i.unidade || produto.unidade) !== produto.unidade) throw new Error("Conversões de unidade não configuradas; use a unidade cadastrada do produto.");
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
      assertCotacaoNaoConcluida(atual);
      validarTransicaoCotacao(atual.status, "CANCELADA");
      if (atual.compras.some(c => c.status !== "CANCELADA")) throw new Error("Cancele a compra vinculada antes de cancelar a cotação.");
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
    if (current.status !== "RASCUNHO") throw new Error("Somente cotações em rascunho podem ser excluídas.");
    const [respostas, compras] = await Promise.all([
      prisma.cotacaoResposta.count({ where: { cotacaoEnvioId: id } }),
      prisma.compra.count({ where: { cotacaoEnvioId: id } }),
    ]);
    if (respostas || compras) throw new Error("A cotação possui respostas ou compras vinculadas e não pode ser excluída.");
    await prisma.$transaction(async tx => {
      const envios = await tx.cotacaoEnvioFornecedor.findMany({ where: { cotacaoEnvioId: id }, select: { id: true } });
      await tx.historicoEnvioMensagem.deleteMany({ where: { cotacaoEnvioFornecedorId: { in: envios.map(item => item.id) } } });
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
    const escopoCompras = req.usuario.perfil === "USUARIO_PADRAO" ? {} : obraScope(req.usuario);
    await prisma.pedidoCompraItem.updateMany({ where: { statusEntrega: { in: ["PENDENTE", "PARCIALMENTE_ENTREGUE"] }, dataPrevistaEntrega: { lt: new Date() }, pedido: { compra: escopoCompras } }, data: { statusEntrega: "ATRASADA" } });
    res.json(await prisma.compra.findMany({
      where: {
        ...escopoCompras,
        ...(isAdminUser(req.usuario) && req.query.obraId ? { obraId: Number(req.query.obraId) } : {}),
        status: req.query.status || undefined,
        dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(req.query.ate) : undefined } : undefined,
      },
      include: {
        obra: true,
        cotacao: true,
        notasFiscais: { where: { ativa: true }, include: { pedido: { include: { fornecedor: true } } } },
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
    if (!observacaoCancelamento) throw new Error("Informe a observação do cancelamento.");
    const result = await prisma.$transaction(async tx => {
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
      assertObraAccess(req.usuario, compra.obraId);
      if (compra.status === "CANCELADA") throw new Error("Esta compra já está cancelada.");
      const atualizada = await tx.compra.update({ where: { id: compraId }, data: { status: "CANCELADA", observacaoCancelamento, canceladaPorId: req.usuario.id, canceladaEm: new Date() } });
      const pedidos = await tx.pedidoCompra.findMany({ where: { compraId } });
      await tx.pedidoCompra.updateMany({ where: { compraId, status: { not: "CANCELADO" } }, data: { status: "CANCELADO" } });
      await tx.pedidoCompraItem.updateMany({ where: { pedidoCompraId: { in: pedidos.map(pedido => pedido.id) }, statusEntrega: { not: "ENTREGUE" } }, data: { statusEntrega: "CANCELADA" } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "Compra", entidadeId: compraId, statusAnterior: compra.status, statusNovo: "CANCELADA", usuarioId: req.usuario.id, compraId, observacao: observacaoCancelamento } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CANCELAR", entidadeTipo: "Compra", entidadeId: compraId, valoresAntes: { status: compra.status }, valoresNovos: { status: "CANCELADA", motivo: observacaoCancelamento }, compraId });
      for (const pedido of pedidos) if (pedido.status !== "CANCELADO") await tx.historicoStatus.create({ data: { entidadeTipo: "PedidoCompra", entidadeId: pedido.id, statusAnterior: pedido.status, statusNovo: "CANCELADO", usuarioId: req.usuario.id, pedidoCompraId: pedido.id, observacao: observacaoCancelamento } });
      return atualizada;
    });
    await notificarUsuario({ usuarioId: result.solicitanteId || req.usuario.id, evento: "COMPRA_CANCELADA", entidadeTipo: "Compra", entidadeId: compraId, chaveIdempotencia: `compra-cancelada:${compraId}`, mensagem: `A compra #${compraId} foi cancelada. Motivo: ${observacaoCancelamento}` }).catch(() => {});
    res.json(result);
  } catch (e) { fail(res, e); }
});

router.delete("/compras/:id", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (_req, res) => {
  return res.status(409).json({ erro: "Compras são registros históricos e não podem ser excluídas. Cancele a compra para preservar sua trilha de auditoria." });
});
router.post("/cotacoes/:id/enviar", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.cotacaoEnvio.findUnique({ where: { id }, include: { obra: true, itens: { include: { produto: true, aplicacao: true } }, fornecedores: { include: { fornecedor: true } } } });
    if (!c || !c.fornecedores.length) throw new Error("Cotação não encontrada ou sem fornecedores.");
    assertObraAccess(req.usuario, c.obraId);
    assertCotacaoNaoConcluida(c);
    if (!["RASCUNHO", "ENVIADA", "EM_ANDAMENTO"].includes(c.status)) throw new Error("Esta cotação não pode ser enviada no estado atual.");
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
      try { ({ identificadorExterno } = await whatsapp.enviar({ telefone: p.fornecedor.telefone, mensagem, usuarioId: req.usuario.id, idempotencia: `cotacao-${c.id}-fornecedor-${p.fornecedorId}` })); }
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
    const frete = req.body.frete === "" || req.body.frete == null ? null : Number(req.body.frete);
    if (frete !== null && (!Number.isFinite(frete) || frete < 0)) throw new Error("Informe um valor de frete válido.");
    const ofertas = itens.map(i => {
      const quantidade = Number(i.quantidadeOfertada ?? 0), valor = Number(i.valorUnitario ?? 0), indisponivel = Boolean(i.indisponivel);
      if (!Number.isFinite(quantidade) || quantidade < 0 || !Number.isFinite(valor) || valor < 0 || (indisponivel && (quantidade !== 0 || valor !== 0)) || (!indisponivel && quantidade === 0)) throw new Error("Oferta deve ter quantidades e valores não negativos; indisponíveis devem usar zero e ofertas disponíveis devem ter quantidade positiva.");
      if (!i.cotacaoEnvioItemId && !i.adicional) throw new Error("Itens fora da solicitação devem ser marcados como adicionais.");
      return { cotacaoEnvioItemId: i.cotacaoEnvioItemId ? Number(i.cotacaoEnvioItemId) : null, produtoId: Number(i.produtoId), quantidadeOfertada: quantidade, valorUnitario: valor, indisponivel, adicional: Boolean(i.adicional), observacao: i.observacao };
    });
    if (ofertas.some(i => i.cotacaoEnvioItemId && i.adicional)) throw new Error("Uma oferta adicional não pode estar vinculada a um item solicitado.");
    const solicitados = await prisma.cotacaoEnvioItem.findMany({ where: { id: { in: ofertas.map(i => i.cotacaoEnvioItemId).filter(Boolean) } }, include: { produto: true } });
    if (solicitados.some(item => item.cotacaoEnvioId !== Number(cotacaoEnvioId))) throw new Error("Item solicitado não pertence à cotação.");
    if (ofertas.some(i => i.cotacaoEnvioItemId && solicitados.find(item => item.id === i.cotacaoEnvioItemId)?.produtoId !== i.produtoId)) throw new Error("O produto ofertado deve corresponder ao produto solicitado.");
    if (!await prisma.cotacaoEnvioFornecedor.findUnique({ where: { cotacaoEnvioId_fornecedorId: { cotacaoEnvioId: Number(cotacaoEnvioId), fornecedorId: Number(fornecedorId) } } })) throw new Error("O fornecedor não foi selecionado para esta cotação.");
    const quote = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(cotacaoEnvioId) } });
    assertObraAccess(req.usuario, quote.obraId);
    assertCotacaoNaoConcluida(quote);
    const resposta = await prisma.$transaction(async tx => {
      const row = await tx.cotacaoResposta.create({ data: { cotacaoEnvioId: Number(cotacaoEnvioId), fornecedorId: Number(fornecedorId), usuarioPreenchimentoId: req.usuario.id, observacao, frete, condicaoPagamento: req.body.condicaoPagamento || null, itens: { create: ofertas } }, include: { itens: true, fornecedor: true } });
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
    assertCotacaoNaoConcluida(current.cotacao);
    if (!["PREENCHIMENTO", "ENCAMINHADA"].includes(current.status)) throw new Error("Esta resposta não pode ser alterada no estado atual.");
    if (current.itens.some(item => item.selecoes.some(selection => selection.status === "APROVADA"))) throw new Error("A resposta contém ofertas vinculadas a compra aprovada e não pode ser alterada.");
    const frete = req.body.frete === undefined ? current.frete : req.body.frete === "" || req.body.frete == null ? null : Number(req.body.frete);
    if (frete !== null && (!Number.isFinite(frete) || frete < 0)) throw new Error("Informe um valor de frete válido.");
    const row = await prisma.$transaction(async tx => {
      const updated = await tx.cotacaoResposta.update({ where: { id }, data: { ...(req.body.observacao !== undefined ? { observacao: req.body.observacao } : {}), ...(req.body.frete !== undefined ? { frete } : {}), ...(req.body.condicaoPagamento !== undefined ? { condicaoPagamento: req.body.condicaoPagamento || null } : {}) }, include: { fornecedor: true, itens: true } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ATUALIZAR", entidadeTipo: "CotacaoResposta", entidadeId: id, valoresAntes: { observacao: current.observacao, frete: current.frete, condicaoPagamento: current.condicaoPagamento }, valoresNovos: { observacao: updated.observacao, frete: updated.frete, condicaoPagamento: updated.condicaoPagamento }, cotacaoEnvioId: current.cotacaoEnvioId });
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
    assertCotacaoNaoConcluida(quote);
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
    assertCotacaoNaoConcluida(quote);
    if (!["PREENCHIMENTO", "ENCAMINHADA"].includes(resposta.status) || item.cotacaoRespostaId !== respostaId) throw new Error("Item não editável ou não pertence à resposta.");
    if (await prisma.selecaoCompraItem.count({ where: { cotacaoRespostaItemId: itemId, status: "APROVADA" } })) throw new Error("Oferta vinculada a compra aprovada não pode ser alterada.");
    const quantidade = Number(req.body.quantidadeOfertada ?? item.quantidadeOfertada), valor = Number(req.body.valorUnitario ?? item.valorUnitario);
    if (quantidade < 0 || valor < 0 || (req.body.indisponivel && (quantidade !== 0 || valor !== 0))) throw new Error("Quantidade e valor precisam ser não negativos; indisponíveis devem usar zero.");
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
    assertCotacaoNaoConcluida(quote);
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
    assertCotacaoNaoConcluida(current.cotacao);
    if (current.status !== "PREENCHIMENTO") throw new Error("Esta resposta já foi encaminhada.");
    const ids = [...new Set((req.body.destinatarioIds || []).map(Number))];
    if (!ids.length || ids.some(id => !Number.isInteger(id))) throw new Error("Selecione ao menos um destinatário para enviar a resposta.");
    const destinatarios = await prisma.whatsAppDestinatario.findMany({ where: { id: { in: ids }, usuarioId: req.usuario.id, ativo: true }, orderBy: { nome: "asc" } });
    if (destinatarios.length !== ids.length) throw new Error("Um ou mais destinatários não existem, estão inativos ou não pertencem a este usuário.");

    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const linhasItens = current.itens.map(item => item.indisponivel
      ? `• ${item.produto.nome}: indisponível`
      : `• ${item.produto.nome}: ${Number(item.quantidadeOfertada)} ${item.produto.unidade} × ${brl.format(Number(item.valorUnitario))} = ${brl.format(Number(item.quantidadeOfertada) * Number(item.valorUnitario))}`);
    const mensagem = [
      `Resposta da cotação #${String(current.cotacaoEnvioId).padStart(4, "0")}`,
      `Obra: ${current.cotacao.obra.nome}`,
      `Fornecedor: ${current.fornecedor.nome}`,
      ...linhasItens,
      current.observacao ? `Observação: ${current.observacao}` : null,
    ].filter(Boolean).join("\n");
    const envios = await Promise.all(destinatarios.map(async destinatario => {
      try {
        const { identificadorExterno } = await whatsapp.enviar({ telefone: destinatario.identificador, mensagem, usuarioId: req.usuario.id });
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
    if (!updated) return res.status(502).json({ erro: `Não foi possível enviar a resposta por WhatsApp: ${falhas.map(item => `${item.destinatario.nome}: ${item.erro}`).join("; ")}` });
    await notificarUsuario({ usuarioId: current.cotacao.usuarioId, evento: "NOVA_RESPOSTA", entidadeTipo: "CotacaoResposta", entidadeId: respostaId, chaveIdempotencia: `resposta-recebida:${respostaId}`, mensagem: `Uma resposta do fornecedor ${current.fornecedor.nome} foi recebida na cotacao #${current.cotacaoEnvioId}.` }).catch(() => {});
    res.json({ resposta: updated, whatsapp: { enviados: enviados.map(item => item.destinatario.nome), falhas: falhas.map(item => ({ nome: item.destinatario.nome, erro: item.erro })) } });
  } catch (e) { fail(res, e); }
});

router.post("/cotacoes/:id/encaminhar-respostas", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cotacao = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id }, include: { obra: true, respostas: { include: { fornecedor: true, itens: { include: { produto: true, itemSolicitado: { include: { aplicacao: true } } } } } } } });
    assertObraAccess(req.usuario, cotacao.obraId);
    assertCotacaoNaoConcluida(cotacao);
    const respostas = cotacao.respostas.filter(resposta => resposta.itens.length);
    if (!respostas.length) throw new Error("A cotação ainda não possui respostas para encaminhar.");
    const destinatarioIds = [...new Set((req.body.destinatarioIds || []).map(Number))];
    if (!destinatarioIds.length || destinatarioIds.some(destinatarioId => !Number.isInteger(destinatarioId))) throw new Error("Selecione ao menos um destinatário.");
    const destinatarios = await prisma.whatsAppDestinatario.findMany({ where: { id: { in: destinatarioIds }, usuarioId: req.usuario.id, ativo: true }, orderBy: { nome: "asc" } });
    if (destinatarios.length !== destinatarioIds.length) throw new Error("Um ou mais destinatários não existem, estão inativos ou não pertencem a este usuário.");

    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const totais = respostas.map(resposta => {
      const produtosTotal = resposta.itens.reduce((total, item) => total + (item.indisponivel ? 0 : Number(item.quantidadeOfertada) * Number(item.valorUnitario)), 0);
      const frete = Number(resposta.frete || 0);
      return { resposta, produtosTotal, frete, total: produtosTotal + frete };
    });
    const linhas = [
      `Comparativo de respostas · Cotação #${String(id).padStart(4, "0")}`,
      `Obra: ${cotacao.obra.nome}`,
      "",
      ...totais.flatMap(({ resposta, produtosTotal, frete, total }) => {
        const aplicacoes = [...new Set(resposta.itens.map(item => item.itemSolicitado?.aplicacao?.nome).filter(Boolean))];
        return [
        `FORNECEDOR: ${resposta.fornecedor.nome}`,
        `Aplicação: ${aplicacoes.length ? aplicacoes.join(", ") : "Sem aplicação"}`,
        ...resposta.itens.map(item => {
          return item.indisponivel
            ? `• ${item.produto.nome}: indisponível`
            : `• ${item.produto.nome}: ${Number(item.quantidadeOfertada)} ${item.produto.unidade} × ${brl.format(Number(item.valorUnitario))} = ${brl.format(Number(item.quantidadeOfertada) * Number(item.valorUnitario))}`;
        }),
        `Produtos: ${brl.format(produtosTotal)} · Frete: ${brl.format(frete)} · Total: ${brl.format(total)}`,
        "",
        ];
      }),
      `Menor total: ${brl.format(Math.min(...totais.map(item => item.total)))} · ${totais.filter(item => item.total === Math.min(...totais.map(entry => entry.total))).map(item => item.resposta.fornecedor.nome).join(", ")}`,
      `Maior total: ${brl.format(Math.max(...totais.map(item => item.total)))} · ${totais.filter(item => item.total === Math.max(...totais.map(entry => entry.total))).map(item => item.resposta.fornecedor.nome).join(", ")}`,
    ];
    const mensagem = linhas.join("\n");
    const envios = await Promise.all(destinatarios.map(async destinatario => {
      try {
        const { identificadorExterno } = await whatsapp.enviar({ telefone: destinatario.identificador, mensagem, usuarioId: req.usuario.id });
        return { destinatario, identificadorExterno, status: "ENVIADO", erro: null };
      } catch (error) { return { destinatario, status: "FALHOU", erro: error.message, identificadorExterno: null }; }
    }));
    const enviados = envios.filter(item => item.status === "ENVIADO");
    await prisma.$transaction(async tx => {
      await tx.historicoEnvioResposta.createMany({ data: respostas.flatMap(resposta => envios.map(envio => ({ cotacaoRespostaId: resposta.id, usuarioId: req.usuario.id, destinatarioId: envio.destinatario.id, destinatarioNome: envio.destinatario.nome, telefone: envio.destinatario.identificador, mensagem, status: envio.status, erro: envio.erro, identificadorExterno: envio.identificadorExterno }))) });
      if (!enviados.length) return;
      await tx.cotacaoResposta.updateMany({ where: { id: { in: respostas.map(resposta => resposta.id) }, status: "PREENCHIMENTO" }, data: { status: "ENCAMINHADA", dataResposta: new Date() } });
      const atual = await tx.cotacaoEnvio.findUniqueOrThrow({ where: { id } });
      let statusCotacao = atual.status;
      const proximosStatus = statusCotacao === "RASCUNHO" ? ["ENVIADA", "EM_ANDAMENTO"] : statusCotacao === "ENVIADA" ? ["EM_ANDAMENTO"] : [];
      for (const proximoStatus of proximosStatus) {
        const novoStatus = validarTransicaoCotacao(statusCotacao, proximoStatus);
        await tx.cotacaoEnvio.update({ where: { id }, data: { status: novoStatus } });
        await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: id, statusAnterior: statusCotacao, statusNovo: novoStatus, usuarioId: req.usuario.id, cotacaoEnvioId: id } });
        statusCotacao = novoStatus;
      }
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ENCAMINHAR_RESPOSTAS", entidadeTipo: "CotacaoEnvio", entidadeId: id, valoresNovos: { respostas: respostas.map(resposta => resposta.id), destinatarios: envios.map(item => ({ id: item.destinatario.id, status: item.status, erro: item.erro })) }, cotacaoEnvioId: id });
    });
    if (!enviados.length) return res.status(502).json({ erro: `Não foi possível enviar o comparativo por WhatsApp: ${envios.map(item => `${item.destinatario.nome}: ${item.erro}`).join("; ")}` });
    res.json({ whatsapp: { enviados: enviados.map(item => item.destinatario.nome), falhas: envios.filter(item => item.status === "FALHOU").map(item => ({ nome: item.destinatario.nome, erro: item.erro })) } });
  } catch (e) { fail(res, e); }
});

router.patch("/compras/ofertas/:id/quantidade-ofertada", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const quantidadeOfertada = Number(req.body.quantidadeOfertada);
    if (!Number.isFinite(quantidadeOfertada) || quantidadeOfertada <= 0) throw new Error("A quantidade ofertada deve ser maior que zero.");

    const oferta = await prisma.cotacaoRespostaItem.findUniqueOrThrow({ where: { id }, include: { resposta: { include: { cotacao: true } } } });
    assertCotacaoNaoConcluida(oferta.resposta.cotacao);
    if (oferta.resposta.status !== "ENCAMINHADA" || oferta.status !== "PENDENTE" || oferta.indisponivel) {
      throw new Error("Somente ofertas encaminhadas e ainda sem decisão podem ser editadas.");
    }

    const aprovada = await prisma.selecaoCompraItem.aggregate({ where: { status: "APROVADA", cotacaoRespostaItemId: id }, _sum: { quantidadeAprovada: true } });
    if (Number(aprovada._sum.quantidadeAprovada || 0) > quantidadeOfertada) throw new Error("A quantidade ofertada não pode ficar abaixo da quantidade já aprovada.");

    res.json(await prisma.cotacaoRespostaItem.update({ where: { id }, data: { quantidadeOfertada } }));
  } catch (e) { fail(res, e); }
});

router.post("/compras/aprovar", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const { cotacaoEnvioId, itens } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { nome: true, email: true } });
    if (!Array.isArray(itens) || !itens.length) throw new Error("Informe itens para decisão.");
    const compra = await prisma.$transaction(async tx => {
      const cotacao = await tx.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(cotacaoEnvioId) }, include: { itens: true, fornecedores: true, respostas: { include: { itens: true } } } });
      assertObraAccess(req.usuario, cotacao.obraId);
      if (!["EM_ANDAMENTO", "ENVIADA"].includes(cotacao.status)) throw new Error("A cotação não está disponível para análise de compra.");
      const c = await tx.compra.upsert({ where: { cotacaoEnvioId: cotacao.id }, update: {}, create: { obraId: cotacao.obraId, cotacaoEnvioId: cotacao.id, solicitanteId: cotacao.usuarioId } });
      const seen = new Set();
      for (const decision of itens) {
        if (seen.has(String(decision.ofertaId))) throw new Error("Cada oferta deve aparecer uma única vez por decisão.");
        seen.add(String(decision.ofertaId));
        const oferta = await tx.cotacaoRespostaItem.findUniqueOrThrow({ where: { id: Number(decision.ofertaId) }, include: { resposta: true } });
        if (oferta.resposta.cotacaoEnvioId !== cotacao.id) throw new Error("Oferta não pertence à cotação informada.");
        if (oferta.cotacaoEnvioItemId && !cotacao.itens.some(i => i.id === oferta.cotacaoEnvioItemId)) throw new Error("Item solicitado não pertence à cotação.");
        const qtd = Number(decision.quantidadeAprovada || 0), unit = Number(decision.valorUnitarioAprovado ?? oferta.valorUnitario);
        if (decision.status === "REJEITADA") {
          await tx.selecaoCompraItem.create({ data: { compraId: c.id, cotacaoRespostaItemId: oferta.id, quantidadeAprovada: 0, valorUnitarioAprovado: unit, aprovadorId: req.usuario.id, status: "REJEITADA" } });
          await tx.cotacaoRespostaItem.update({ where: { id: oferta.id }, data: { status: "REJEITADA" } }); continue;
        }
        if (oferta.indisponivel || qtd <= 0 || qtd > Number(oferta.quantidadeOfertada) || unit < 0) throw new Error("Quantidade ou valor aprovado inválido.");
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
        const aprovacoes = await tx.selecaoCompraItem.findMany({ where: { compraId: c.id, status: "APROVADA" }, include: { oferta: { include: { resposta: true } } } });
        const fornecedoresAprovados = new Map(aprovacoes.map(row => [row.oferta.resposta.fornecedorId, row.oferta.resposta]));
        const freteAprovado = [...fornecedoresAprovados.values()].reduce((sum, resposta) => sum + Number(resposta.frete || 0), 0);
        const totalAprovado = aprovacoes.reduce((sum, row) => sum + Number(row.quantidadeAprovada) * Number(row.valorUnitarioAprovado), 0) + freteAprovado;
        await tx.compra.update({ where: { id: c.id }, data: { aprovadorId: req.usuario.id, aprovadaEm: new Date(), valorAprovado: totalAprovado } });
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
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "APROVAR_OFERTAS", entidadeTipo: "Compra", entidadeId: c.id, valoresNovos: { ofertas: itens, totalAprovado: selecoesAprovadas ? (await tx.compra.findUnique({ where: { id: c.id }, select: { valorAprovado: true } })).valorAprovado : 0 }, cotacaoEnvioId: cotacao.id, compraId: c.id });
      return tx.compra.findUnique({ where: { id: c.id }, include: { obra: true, cotacao: true, notasFiscais: { where: { ativa: true } }, selecoes: { include: { oferta: { include: { resposta: { include: { fornecedor: true } }, produto: true, itemSolicitado: { include: { aplicacao: true } } } }, aprovador: { select: { nome: true } } } } } });
    }, { isolationLevel: "Serializable" });
    const ofertasAprovadasAgora = new Set(itens.filter(item => item.status !== "REJEITADA").map(item => Number(item.ofertaId)));
    const aprovados = compra.selecoes.filter(selecao => selecao.status === "APROVADA" && ofertasAprovadasAgora.has(selecao.cotacaoRespostaItemId));
    if (!aprovados.length && compra.cotacao.status === "ENCERRADA") await notificarUsuario({ usuarioId: compra.cotacao.usuarioId, evento: "COTACAO_ENCERRADA", entidadeTipo: "CotacaoEnvio", entidadeId: compra.cotacaoEnvioId, chaveIdempotencia: `cotacao-encerrada:${compra.cotacaoEnvioId}`, mensagem: `A cotacao #${compra.cotacaoEnvioId} foi encerrada sem compra aprovada.` }).catch(() => {});
    const grupos = Map.groupBy(aprovados, selecao => selecao.oferta.resposta.fornecedorId);
    const dataFechamento = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const notificacoes = await Promise.all([...grupos.values()].map(async selecoes => {
      const fornecedor = selecoes[0].oferta.resposta.fornecedor;
      const aplicacoes = [...new Set(selecoes.map(selecao => selecao.oferta.itemSolicitado?.aplicacao?.nome).filter(Boolean))];
      const linhasAplicacoes = aplicacoes.length ? aplicacoes.map(nome => `* ${nome}`) : ["*Todas as aplicações"];
      const linhasProdutos = selecoes.map(selecao => `* ${selecao.oferta.produto.nome}: ${selecao.quantidadeAprovada} ${selecao.oferta.produto.unidade}`);
      const mensagem = [
        "Olá!",
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
        "*Observações:*",
        compra.cotacao.observacao || "Nenhuma.",
        "",
        "Por gentileza, solicite à equipe responsável que inclua as seguintes informações no *rodapé da nota fiscal*: ",
        "",
        `*Obra:* ${compra.obra.nome}`,
        `*Aplicações:* ${aplicacoes.length ? aplicacoes.join(", ") : "Todas as aplicações"}`,
        "",
        "Atenciosamente,",
        usuario?.nome || "Equipe de compras",
        "Construtora Gil Ferreira LTDA",
        usuario?.email || "",
        "",
        "Agradecemos pela parceria!",
      ].join("\n");

      try {
        const { identificadorExterno } = await whatsapp.enviar({ telefone: fornecedor.telefone, mensagem, usuarioId: req.usuario.id });
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
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
      assertObraAccess(req.usuario, compra.obraId);
      if (compra.status === "CANCELADA" || !compra.aprovadaEm) throw new Error("A compra precisa estar aprovada e ativa para gerar pedidos.");
      const aprovados = await tx.selecaoCompraItem.findMany({ where: { compraId, status: "APROVADA" }, include: { oferta: { include: { resposta: true } } } });
      if (!aprovados.length) throw new Error("A compra não possui itens aprovados.");
      const grupos = Map.groupBy(aprovados, s => String(s.oferta.resposta.fornecedorId));
      for (const [fornecedorId, selecoes] of grupos) {
        const pedido = await tx.pedidoCompra.upsert({ where: { compraId_fornecedorId: { compraId, fornecedorId: Number(fornecedorId) } }, update: {}, create: { compraId, fornecedorId: Number(fornecedorId) } });
        for (const s of selecoes) await tx.pedidoCompraItem.upsert({ where: { selecaoCompraItemId: s.id }, update: {}, create: { pedidoCompraId: pedido.id, selecaoCompraItemId: s.id, quantidade: s.quantidadeAprovada, valorUnitario: s.valorUnitarioAprovado } });
      }
      const updated = await tx.compra.update({ where: { id: compraId }, data: { status: "PEDIDOS_ABERTOS" } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "Compra", entidadeId: compraId, statusAnterior: compra.status, statusNovo: updated.status, usuarioId: req.usuario.id, compraId } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "GERAR_PEDIDOS", entidadeTipo: "Compra", entidadeId: compraId, valoresAntes: { status: compra.status }, valoresNovos: { status: updated.status }, compraId });
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
      if (await tx.selecaoCompraItem.count({ where: { compraId, status: "APROVADA" } })) throw new Error("A cotação já possui itens aprovados e não pode ser encerrada sem compra.");
      if (respostasEstaoPendentes(current.cotacao.respostas, current.cotacao.fornecedores)) throw new Error("Existem respostas de fornecedores pendentes.");
      if (await tx.cotacaoRespostaItem.count({ where: { resposta: { cotacaoEnvioId: current.cotacaoEnvioId }, status: "PENDENTE" } })) throw new Error("Existem ofertas pendentes de análise.");
      const status = validarTransicaoCotacao(current.cotacao.status, "ENCERRADA", { respostasPendentes: false });
      await tx.cotacaoResposta.updateMany({ where: { cotacaoEnvioId: current.cotacaoEnvioId, status: "ENCAMINHADA" }, data: { status: "ENCERRADA" } });
      const cotacao = await tx.cotacaoEnvio.update({ where: { id: current.cotacaoEnvioId }, data: { status } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, statusAnterior: current.cotacao.status, statusNovo: cotacao.status, usuarioId: req.usuario.id, cotacaoEnvioId: cotacao.id } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ENCERRAR", entidadeTipo: "CotacaoEnvio", entidadeId: cotacao.id, valoresAntes: { status: current.cotacao.status }, valoresNovos: { status: cotacao.status }, cotacaoEnvioId: cotacao.id });
      return cotacao;
    });
    await notificarUsuario({ usuarioId: compra.usuarioId, evento: "COTACAO_ENCERRADA", entidadeTipo: "CotacaoEnvio", entidadeId: compra.id, chaveIdempotencia: `cotacao-encerrada:${compra.id}`, mensagem: `A cotacao #${compra.id} foi encerrada sem compra aprovada.` }).catch(() => {});
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
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "CONFIRMAR_PEDIDO", entidadeTipo: "PedidoCompra", entidadeId: id, valoresAntes: { status: current.status }, valoresNovos: { status: updated.status }, compraId: current.compraId, pedidoCompraId: id });
      return updated;
    });
    res.json(pedido);
  }
  catch (e) { fail(res, e); }
});

router.post("/pedidos/:id/notas-fiscais", async (req, res) => {
  try {
    const pedidoCompraId = Number(req.params.id);
    const result = await prisma.$transaction(async tx => {
      const pedido = await tx.pedidoCompra.findUniqueOrThrow({ where: { id: pedidoCompraId }, include: { compra: true } });
      assertObraAccess(req.usuario, pedido.compra.obraId);
      const notaFiscal = await salvarNotaFiscal(tx, { compraId: pedido.compraId, pedidoCompraId, usuarioId: req.usuario.id, dados: req.body });
      await concluirCompraSePronta(tx, pedido.compraId, req.usuario.id);
      return notaFiscal;
    });
    res.status(200).json(result);
  } catch (e) { fail(res, e); }
});

router.put("/compras/:id/nota-fiscal", async (req, res) => {
  try {
    const compraId = Number(req.params.id), pedidoCompraId = Number(req.body.pedidoCompraId);
    const result = await prisma.$transaction(async tx => {
      const compra = await tx.compra.findUniqueOrThrow({ where: { id: compraId } });
      assertObraAccess(req.usuario, compra.obraId);
      const pedido = await tx.pedidoCompra.findUniqueOrThrow({ where: { id: pedidoCompraId } });
      if (pedido.compraId !== compraId) throw new Error("O pedido informado não pertence a esta compra.");
      const notaFiscal = await salvarNotaFiscal(tx, { compraId, pedidoCompraId, usuarioId: req.usuario.id, dados: req.body });
      await concluirCompraSePronta(tx, compraId, req.usuario.id);
      return notaFiscal;
    });
    res.json(result);
  } catch (e) { fail(res, e); }
});

router.get("/compras/:id/notas-fiscais/historico", async (req, res) => {
  try {
    const compra = await prisma.compra.findUniqueOrThrow({ where: { id: Number(req.params.id) } });
    assertObraAccess(req.usuario, compra.obraId);
    res.json(await prisma.historicoNotaFiscal.findMany({ where: { compraId: compra.id }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { substituidaEm: "desc" } }));
  } catch (e) { fail(res, e); }
});

router.patch("/pedidos/:id/previsao-entrega", async (req, res) => {
  try {
    const pedidoId = Number(req.params.id);
    const dataPrevistaEntrega = req.body.dataPrevistaEntrega ? new Date(req.body.dataPrevistaEntrega) : null;
    if (dataPrevistaEntrega && Number.isNaN(dataPrevistaEntrega.getTime())) throw new Error("Data prevista de entrega inválida.");
    const result = await prisma.$transaction(async tx => {
      const pedido = await tx.pedidoCompra.findUniqueOrThrow({ where: { id: pedidoId }, include: { compra: true, itens: { include: { recebimentos: true } } } });
      assertObraAccess(req.usuario, pedido.compra.obraId);
      if (pedido.status === "CANCELADO") throw new Error("Não é possível prever a entrega de um pedido cancelado.");
      const fornecedores = await tx.pedidoCompra.findMany({ where: { compraId: pedido.compraId, status: { not: "CANCELADO" } }, select: { fornecedorId: true } });
      if (new Set(fornecedores.map(item => item.fornecedorId)).size < 2) throw new Error("A previsão separada só está disponível quando a compra tem mais de um fornecedor.");
      const itens = pedido.itens.filter(item => !["ENTREGUE", "CANCELADA"].includes(item.statusEntrega));
      if (!itens.length) throw new Error("Não há produtos pendentes de entrega nesta compra.");
      const updated = [];
      for (const item of itens) {
        const quantidadeRecebida = item.recebimentos.reduce((sum, recebimento) => sum + Number(recebimento.quantidadeRecebida), 0);
        const statusEntrega = calcularStatusEntrega({ quantidade: item.quantidade, recebida: quantidadeRecebida, dataPrevista: dataPrevistaEntrega });
        const row = await tx.pedidoCompraItem.update({ where: { id: item.id }, data: { dataPrevistaEntrega, statusEntrega, observacaoEntrega: req.body.observacoes ?? item.observacaoEntrega } });
        await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "ATUALIZAR_PREVISAO_ENTREGA_FORNECEDOR", entidadeTipo: "PedidoCompraItem", entidadeId: item.id, valoresAntes: { dataPrevistaEntrega: item.dataPrevistaEntrega, statusEntrega: item.statusEntrega, observacaoEntrega: item.observacaoEntrega }, valoresNovos: row, compraId: pedido.compraId, pedidoCompraId: pedido.id });
        updated.push(row);
      }
      return updated;
    });
    res.json({ itensAtualizados: result.length, dataPrevistaEntrega });
  } catch (e) { fail(res, e); }
});

router.post("/pedidos/itens/:id/recebimentos", async (req, res) => {
  try {
    const itemId = Number(req.params.id), quantidadeRecebida = Number(req.body.quantidadeRecebida);
    const result = await prisma.$transaction(async tx => {
      const item = await tx.pedidoCompraItem.findUniqueOrThrow({ where: { id: itemId }, include: { pedido: { include: { compra: true } } } });
      assertObraAccess(req.usuario, item.pedido.compra.obraId);
      if (item.statusEntrega === "CANCELADA") throw new Error("Não é possível receber um item com entrega cancelada.");
      const anterior = await tx.recebimentoItem.aggregate({ where: { pedidoCompraItemId: itemId }, _sum: { quantidadeRecebida: true } });
      if (quantidadeRecebida <= 0 || Number(anterior._sum.quantidadeRecebida || 0) + quantidadeRecebida > Number(item.quantidade)) throw new Error("Quantidade recebida inválida ou acima do saldo do pedido.");
      const recebimento = await tx.recebimentoItem.create({ data: { pedidoCompraItemId: itemId, quantidadeRecebida, usuarioId: req.usuario.id, observacao: req.body.observacao } });
      const itemTotal = Number(anterior._sum.quantidadeRecebida || 0) + quantidadeRecebida;
      const itemEntregue = itemTotal >= Number(item.quantidade);
      await tx.pedidoCompraItem.update({ where: { id: itemId }, data: { statusEntrega: calcularStatusEntrega({ quantidade: item.quantidade, recebida: itemTotal, dataPrevista: item.dataPrevistaEntrega }), dataEntregaEfetiva: itemEntregue ? recebimento.dataRecebimento : null, observacaoEntrega: req.body.observacao || item.observacaoEntrega } });
      const total = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: item.pedidoCompraId }, include: { recebimentos: true } });
      const concluido = total.every(i => i.recebimentos.reduce((s, r) => s + Number(r.quantidadeRecebida), 0) >= Number(i.quantidade));
      const iniciado = total.some(i => i.recebimentos.length);
      await tx.pedidoCompra.update({ where: { id: item.pedidoCompraId }, data: { status: concluido ? "RECEBIDO" : iniciado ? "PARCIALMENTE_RECEBIDO" : item.pedido.status } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "RecebimentoItem", entidadeId: recebimento.id, statusNovo: concluido ? "RECEBIDO" : "PARCIALMENTE_RECEBIDO", usuarioId: req.usuario.id, pedidoCompraId: item.pedidoCompraId, observacao: `Recebimento de ${quantidadeRecebida}` } });
      await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "REGISTRAR_RECEBIMENTO", entidadeTipo: "RecebimentoItem", entidadeId: recebimento.id, valoresNovos: recebimento, compraId: item.pedido.compraId, pedidoCompraId: item.pedidoCompraId });
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
    if (Number.isNaN(data.getTime())) throw new Error("Informe uma data de recebimento válida.");

    const result = await prisma.$transaction(async tx => {
      const pedido = await tx.pedidoCompra.findUniqueOrThrow({ where: { id: pedidoId }, include: { compra: true, itens: { include: { recebimentos: true } } } });
      assertObraAccess(req.usuario, pedido.compra.obraId);
      if (pedido.status === "CANCELADO") throw new Error("Não é possível registrar recebimento de um pedido cancelado.");
      const ids = itens.map(item => Number(item.pedidoCompraItemId));
      if (new Set(ids).size !== ids.length || ids.some(id => !pedido.itens.some(item => item.id === id))) throw new Error("Há produtos inválidos ou repetidos neste recebimento.");

      const registros = [];
      for (const entrada of itens) {
        const item = pedido.itens.find(row => row.id === Number(entrada.pedidoCompraItemId));
        if (item.statusEntrega === "CANCELADA") throw new Error("Não é possível receber um item com entrega cancelada.");
        const quantidade = Number(entrada.quantidadeRecebida);
        const jaRecebida = item.recebimentos.reduce((sum, registro) => sum + Number(registro.quantidadeRecebida), 0);
        if (!Number.isFinite(quantidade) || quantidade < 0 || jaRecebida + quantidade > Number(item.quantidade)) throw new Error("Uma das quantidades recebidas é inválida ou maior que o saldo do pedido.");
        if (quantidade > 0) {
          const registro = await tx.recebimentoItem.create({ data: { pedidoCompraItemId: item.id, quantidadeRecebida: quantidade, dataRecebimento: data, usuarioId: req.usuario.id, observacao } });
          registros.push(registro);
        }
      }

      const atualizados = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: pedidoId }, include: { recebimentos: true } });
      for (const item of atualizados) {
        const quantidadeRecebida = item.recebimentos.reduce((sum, registro) => sum + Number(registro.quantidadeRecebida), 0);
        const entregue = quantidadeRecebida >= Number(item.quantidade);
        await tx.pedidoCompraItem.update({ where: { id: item.id }, data: { statusEntrega: calcularStatusEntrega({ quantidade: item.quantidade, recebida: quantidadeRecebida, dataPrevista: item.dataPrevistaEntrega }), dataEntregaEfetiva: entregue ? data : null, observacaoEntrega: observacao || item.observacaoEntrega } });
      }
      const concluido = atualizados.every(item => item.recebimentos.reduce((sum, registro) => sum + Number(registro.quantidadeRecebida), 0) >= Number(item.quantidade));
      const iniciado = atualizados.some(item => item.recebimentos.length > 0);
      const status = concluido ? "RECEBIDO" : iniciado ? "PARCIALMENTE_RECEBIDO" : pedido.status;
      const pedidoAtualizado = await tx.pedidoCompra.update({ where: { id: pedidoId }, data: { status } });
      for (const registro of registros) await registrarAuditoria(tx, { usuarioId: req.usuario.id, operacao: "REGISTRAR_RECEBIMENTO", entidadeTipo: "RecebimentoItem", entidadeId: registro.id, valoresNovos: registro, compraId: pedido.compraId, pedidoCompraId: pedidoId });
      for (const registro of registros) await tx.historicoStatus.create({ data: { entidadeTipo: "RecebimentoItem", entidadeId: registro.id, statusNovo: status, usuarioId: req.usuario.id, pedidoCompraId: pedidoId, observacao: `Recebimento de ${registro.quantidadeRecebida}${observacao ? ` · ${observacao}` : ""}` } });
      await concluirCompraSePronta(tx, pedido.compraId, req.usuario.id);
      return { pedido: pedidoAtualizado, recebimentos: registros };
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});

router.get("/relatorios/gastos", async (req, res) => {
  try {
    const linhas = await carregarLinhasGastos(req.usuario, req.query);
    const chave = ({ fornecedor: "fornecedor", produto: "produto", aplicacao: "aplicacao", obra: "obra" })[req.query.agruparPor] || "obra";
    const resumo = resumirGastos(linhas, chave);
    if (req.query.formato === "csv") {
      const fields = ["compraId", "obra", "fornecedor", "produto", "aplicacao", "quantidade", "unidade", "valorUnitario", "freteAlocado", "total", "data"];
      const csv = [fields.join(","), ...linhas.map(row => fields.map(key => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=relatorio-gastos.csv"); return res.send(`\ufeff${csv}`);
    }
    if (req.query.formato === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=relatorio-gastos.pdf");
      const pdf = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
      pdf.pipe(res); pdf.fontSize(18).text("Relatório de gastos", { align: "center" });
      pdf.moveDown().fontSize(9).text(`Obra: ${req.query.obraId || "todas"} · Período: ${req.query.de || "início"} até ${req.query.ate || "hoje"}`);
      pdf.moveDown().fontSize(9).text("Obra | Fornecedor | Produto | Aplicação | Quantidade | Unitário | Frete alocado | Total | Data");
      for (const x of linhas) {
        if (pdf.y > 520) pdf.addPage();
        pdf.fontSize(7).text(`${x.obra} | ${x.fornecedor} | ${x.produto} | ${x.aplicacao} | ${x.quantidade} ${x.unidade} | R$ ${x.valorUnitario.toFixed(2)} | R$ ${x.freteAlocado.toFixed(2)} | R$ ${x.total.toFixed(2)} | ${x.data.slice(0,10)}`);
      }
      pdf.end(); return;
    }
    res.json({ filtros: req.query, chave, resumo, linhas, total: linhas.reduce((sum, row) => sum + row.total, 0) });
  } catch (e) { fail(res, e); }
});

async function carregarLinhasGastos(usuario, query, periodo = {}) {
  const de = periodo.de ?? query.de;
  const ate = periodo.ate ?? query.ate;
  const orders = await prisma.pedidoCompra.findMany({
    where: {
      status: { not: "CANCELADO" },
      fornecedorId: query.fornecedorId ? Number(query.fornecedorId) : undefined,
      compra: {
        ...obraScope(usuario),
        ...(query.obraId ? { obraId: isAdminUser(usuario) || Number(query.obraId) === Number(usuario.obraId) ? Number(query.obraId) : -1 } : {}),
        status: { not: "CANCELADA" },
        dataCriacao: de || ate ? { gte: de ? new Date(de) : undefined, lte: ate ? new Date(`${ate}T23:59:59.999`) : undefined } : undefined,
      },
    },
    include: { fornecedor: true, compra: { include: { obra: true } }, itens: { include: { selecao: { include: { oferta: { include: { produto: true, itemSolicitado: { include: { aplicacao: true } }, resposta: true } } } } } } },
    orderBy: { compra: { dataCriacao: "asc" } },
  });
  const applicationIds = new Set(String(query.aplicacaoIds || "").split(",").filter(Boolean).map(Number));
  const linhas = [];
  for (const pedido of orders) {
    const selected = pedido.itens.map(item => {
      const selection = item.selecao;
      const oferta = selection.oferta;
      const app = oferta.itemSolicitado?.aplicacao;
      return {
        compraId: pedido.compraId, obraId: pedido.compra.obraId, obra: pedido.compra.obra.nome,
        fornecedorId: pedido.fornecedorId, fornecedor: pedido.fornecedor.nome,
        produtoId: oferta.produto.id, produto: oferta.produto.nome, unidade: oferta.produto.unidade,
        aplicacaoId: app?.id ?? null, aplicacao: app?.nome || "Sem aplicação",
        quantidade: Number(item.quantidade), valorUnitario: Number(item.valorUnitario),
        subtotal: Number(item.quantidade) * Number(item.valorUnitario),
        frete: Number(oferta.resposta.frete || 0), data: pedido.compra.dataCriacao.toISOString(), mes: pedido.compra.dataCriacao.toISOString().slice(0, 7),
      };
    });
    const subtotal = selected.reduce((sum, row) => sum + row.subtotal, 0);
    for (const row of selected) {
      row.freteAlocado = subtotal ? row.frete * row.subtotal / subtotal : row.frete / Math.max(selected.length, 1);
      row.total = row.subtotal + row.freteAlocado;
      if ((!query.produtoId || row.produtoId === Number(query.produtoId)) && (!applicationIds.size || applicationIds.has(row.aplicacaoId))) linhas.push(row);
    }
  }
  return linhas;
}

function resumirGastos(linhas, chave, labelKey = chave) {
  const groups = Map.groupBy(linhas, row => row[chave] ?? (labelKey === "aplicacao" ? "Sem aplicação" : ""));
  return [...groups].map(([id, rows]) => ({ id, nome: rows[0][labelKey] || "Sem aplicação", total: rows.reduce((sum, row) => sum + row.total, 0), compras: new Set(rows.map(row => row.compraId)).size, produtos: new Set(rows.map(row => row.produtoId)).size })).sort((a, b) => b.total - a.total);
}

router.get("/relatorios/gerencial", async (req, res) => {
  try {
    const linhas = await carregarLinhasGastos(req.usuario, req.query);
    const total = linhas.reduce((sum, row) => sum + row.total, 0);
    const gastosPorObra = resumirGastos(linhas, "obraId", "obra").map(row => ({ obra: row.nome, obraId: row.id, total: row.total, quantidadeCompras: row.compras, participacaoPercentual: total ? row.total / total * 100 : 0 }));
    const gastosPorAplicacao = resumirGastos(linhas, "aplicacaoId", "aplicacao").map(row => ({ aplicacao: row.nome, aplicacaoId: row.id || null, total: row.total, quantidadeCompras: row.compras, participacaoPercentual: total ? row.total / total * 100 : 0 }));
    const fornecedores = resumirGastos(linhas, "fornecedorId", "fornecedor").map(row => ({ fornecedor: row.nome, fornecedorId: row.id, totalComprado: row.total, quantidadeCompras: row.compras, variedadeProdutos: row.produtos, participacaoPercentual: total ? row.total / total * 100 : 0 }));
    const months = Map.groupBy(linhas, row => row.mes);
    const gastosPorMes = [...months].map(([mes, rows]) => ({ mes, total: rows.reduce((sum, row) => sum + row.total, 0) })).sort((a, b) => a.mes.localeCompare(b.mes));
    let comparacao = null;
    if (req.query.de && req.query.ate) {
      const start = new Date(req.query.de); const end = new Date(`${req.query.ate}T23:59:59.999`);
      const days = Math.max(1, Math.ceil((end - start + 1) / 86400000));
      const prevEnd = new Date(start.getTime() - 1); const prevStart = new Date(prevEnd.getTime() - days * 86400000 + 1);
      const previous = await carregarLinhasGastos(req.usuario, req.query, { de: prevStart.toISOString().slice(0, 10), ate: prevEnd.toISOString().slice(0, 10) });
      const totalAnterior = previous.reduce((sum, row) => sum + row.total, 0);
      if (previous.length) {
        const anterior = { total: totalAnterior, quantidadeCompras: new Set(previous.map(row => row.compraId)).size, quantidadeFornecedores: new Set(previous.map(row => row.fornecedorId)).size, quantidadeProdutos: new Set(previous.map(row => row.produtoId)).size, quantidadeObras: new Set(previous.map(row => row.obraId)).size };
        const atual = { total, quantidadeCompras: new Set(linhas.map(row => row.compraId)).size, quantidadeFornecedores: new Set(linhas.map(row => row.fornecedorId)).size, quantidadeProdutos: new Set(linhas.map(row => row.produtoId)).size, quantidadeObras: new Set(linhas.map(row => row.obraId)).size };
        comparacao = { anterior, variacoes: Object.fromEntries(Object.entries(atual).map(([key, value]) => [key, anterior[key] ? (value - anterior[key]) / anterior[key] * 100 : null])) };
      }
    }
    res.json({ filtros: req.query, indicadores: { total, quantidadeCompras: new Set(linhas.map(row => row.compraId)).size, quantidadeFornecedores: new Set(linhas.map(row => row.fornecedorId)).size, quantidadeProdutos: new Set(linhas.map(row => row.produtoId)).size, quantidadeObras: new Set(linhas.map(row => row.obraId)).size, quantidadeUnidades: linhas.reduce((sum, row) => sum + row.quantidade, 0), comparacao }, gastosPorObra, gastosPorAplicacao, gastosPorMes, fornecedores, linhas });
  } catch (e) { fail(res, e); }
});

router.get("/relatorios/precos", async (req, res) => {
  try {
    const produtoId = Number(req.query.produtoId);
    if (!Number.isInteger(produtoId) || produtoId <= 0) throw new Error("Informe um produto para comparar precos.");
    const applicationIds = String(req.query.aplicacaoIds || "").split(",").filter(Boolean).map(Number);
    const produto = await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } });
    const ofertas = await prisma.cotacaoRespostaItem.findMany({ where: {
      produtoId,
      indisponivel: false,
      itemSolicitado: { is: { produtoId, ...(applicationIds.length ? { aplicacaoId: { in: applicationIds } } : {}) } },
      resposta: { is: { status: { in: ["ENCAMINHADA", "APROVADA", "ENCERRADA"] }, fornecedorId: req.query.fornecedorId ? Number(req.query.fornecedorId) : undefined, cotacao: { is: { ...obraScope(req.usuario), ...(isAdminUser(req.usuario) && req.query.obraId ? { obraId: Number(req.query.obraId) } : {}), dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(`${req.query.ate}T23:59:59.999`) : undefined } : undefined } } } },
    }, include: { itemSolicitado: true, resposta: { include: { fornecedor: true, cotacao: { include: { obra: true } } } } } });
    const linhas = ofertas.filter(oferta => oferta.itemSolicitado?.unidade === produto.unidade).map(oferta => ({ produtoId, produto: produto.nome, especificacao: produto.especificacao || produto.referencia || produto.nome, unidade: oferta.itemSolicitado.unidade, quantidadeSolicitada: Number(oferta.itemSolicitado.quantidadeSolicitada), quantidade: Number(oferta.quantidadeOfertada), valorUnitario: Number(oferta.valorUnitario), total: Number(oferta.quantidadeOfertada) * Number(oferta.valorUnitario), fornecedorId: oferta.resposta.fornecedorId, fornecedor: oferta.resposta.fornecedor.nome, cotacaoId: oferta.resposta.cotacaoEnvioId, obra: oferta.resposta.cotacao.obra.nome, data: oferta.resposta.dataResposta || oferta.resposta.cotacao.dataCriacao, frete: oferta.resposta.frete == null ? null : Number(oferta.resposta.frete), condicaoPagamento: oferta.resposta.condicaoPagamento }));
    linhas.sort((a, b) => req.query.modo === "historico" ? new Date(a.data) - new Date(b.data) : a.valorUnitario - b.valorUnitario);
    const estatisticas = calcularEstatisticasPreco(linhas);
    res.json({ produto: { id: produto.id, nome: produto.nome, especificacao: produto.especificacao || produto.referencia || produto.nome, unidade: produto.unidade }, linhas, estatisticas: estatisticas[0] || null });
  } catch (e) { fail(res, e); }
});

router.get("/relatorios/cotacoes", async (req, res) => {
  try {
    const applicationIds = String(req.query.aplicacaoIds || "").split(",").filter(Boolean).map(Number);
    const cotacoes = await prisma.cotacaoEnvio.findMany({ where: { ...obraScope(req.usuario), ...(req.query.obraId ? { obraId: isAdminUser(req.usuario) || Number(req.query.obraId) === Number(req.usuario.obraId) ? Number(req.query.obraId) : -1 } : {}), fornecedores: req.query.fornecedorId ? { some: { fornecedorId: Number(req.query.fornecedorId) } } : undefined, dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(`${req.query.ate}T23:59:59.999`) : undefined } : undefined, itens: req.query.produtoId || applicationIds.length ? { some: { produtoId: req.query.produtoId ? Number(req.query.produtoId) : undefined, aplicacaoId: applicationIds.length ? { in: applicationIds } : undefined } } : undefined }, include: { obra: true, itens: { include: { produto: true, aplicacao: true, ofertas: { include: { resposta: { include: { fornecedor: true } } } } } }, respostas: { include: { itens: true } } }, orderBy: { dataCriacao: "desc" }, take: Math.min(Number(req.query.limite) || 500, 1000) });
    const rows = cotacoes.flatMap(c => c.itens.filter(i => (!req.query.produtoId || i.produtoId === Number(req.query.produtoId)) && (!applicationIds.length || applicationIds.includes(i.aplicacaoId))).flatMap(i => i.ofertas.filter(o => !req.query.fornecedorId || o.resposta.fornecedorId === Number(req.query.fornecedorId)).map(o => ({ cotacaoId: c.id, obra: c.obra.nome, produto: i.produto.nome, unidade: i.unidade, aplicacao: i.aplicacao?.nome || "Sem aplicação", solicitada: Number(i.quantidadeSolicitada), fornecedorId: o.resposta.fornecedorId, fornecedor: o.resposta.fornecedor.nome, ofertada: Number(o.quantidadeOfertada), valorUnitario: Number(o.valorUnitario), total: Number(o.quantidadeOfertada) * Number(o.valorUnitario), disponibilidade: o.indisponivel ? "Indisponível" : "Disponível" }))));
    if (req.query.formato === "csv") {
      const csv = ["cotacaoId,obra,produto,unidade,solicitada,fornecedor,ofertada,valorUnitario,total,disponibilidade", ...rows.map(x => Object.values(x).map(v => `"${String(v).replaceAll('"','""')}"`).join(","))].join("\r\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", "attachment; filename=relatorio-cotacoes.csv"); return res.send(`\ufeff${csv}`);
    }
    if (req.query.formato === "pdf") {
      res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", "attachment; filename=relatorio-cotacoes.pdf");
      const pdf = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" }); pdf.pipe(res); pdf.fontSize(18).text("Comparativo de cotações", { align: "center" }); pdf.moveDown().fontSize(9).text(`Filtros: obra=${req.query.obraId || "todas"}; produto=${req.query.produtoId || "todos"}; período=${req.query.de || "início"} até ${req.query.ate || "hoje"}`); pdf.moveDown().fontSize(10).text("Cotação | Obra | Produto | Fornecedor | Qtd. solicitada | Qtd. ofertada | Unitário | Total | Situação");
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
    else if (!isAdminUser(req.usuario)) throw Object.assign(new Error("Somente administradores podem consultar este histórico."), { status: 403 });
    if (obraId != null) assertObraAccess(req.usuario, obraId);
    const [historico, auditoria] = await Promise.all([
      prisma.historicoStatus.findMany({ where: { entidadeTipo: tipo, entidadeId: id }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { dataHora: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500) }),
      prisma.auditoria.findMany({ where: { entidadeTipo: tipo, entidadeId: String(id) }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { dataHora: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500) }),
    ]);
    res.json({ status: historico, alteracoes: auditoria });
  }
  catch (e) { fail(res, e); }
});

router.get("/notificacoes", async (req, res) => {
  try {
    const rows = await prisma.notificacao.findMany({ where: isAdminUser(req.usuario) ? {} : { usuarioId: req.usuario.id }, orderBy: { criadoEm: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500) });
    res.json(rows.map(row => ({ ...row, id: row.id.toString() })));
  } catch (e) { fail(res, e); }
});

router.post("/notificacoes/:id/tentar-novamente", async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const current = await prisma.notificacao.findUniqueOrThrow({ where: { id } });
    if (!isAdminUser(req.usuario) && current.usuarioId !== req.usuario.id) return res.status(403).json({ erro: "Permissao insuficiente." });
    const row = await tentarNovamenteNotificacao(id);
    res.json({ ...row, id: row.id.toString() });
  } catch (e) { fail(res, e); }
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




