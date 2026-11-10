import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../prisma/lib/prisma.ts";
import { WhatsAppProvider } from "../Services/whatsapp.service.js";
import { permitir } from "../middleware/auth.js";

const router = Router();
const whatsapp = new WhatsAppProvider();
const fail = (res, e) => res.status(e.code === "P2025" ? 404 : 400).json({ erro: e.message });

router.post("/cotacoes", async (req, res) => {
  try {
    const { obraId, observacao, itens, fornecedorIds } = req.body;
    if (!Number.isInteger(obraId) || !Array.isArray(itens) || !itens.length) throw new Error("Informe uma obra e ao menos um item.");
    const cotacao = await prisma.$transaction(async tx => {
      const c = await tx.cotacaoEnvio.create({ data: { obraId, usuarioId: req.usuario.id, observacao, itens: { create: itens.map(i => {
        const quantidade = Number(i.quantidadeSolicitada);
        if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error("A quantidade solicitada deve ser maior que zero.");
        return { produtoId: Number(i.produtoId), quantidadeSolicitada: quantidade, unidade: i.unidade, aplicacaoId: i.aplicacaoId ? Number(i.aplicacaoId) : null };
      }) }, fornecedores: { create: [...new Set(fornecedorIds || [])].map(id => ({ fornecedorId: Number(id) })) } }, include: { itens: true, fornecedores: true } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: c.id, statusNovo: c.status, usuarioId: req.usuario.id, cotacaoEnvioId: c.id } });
      return c;
    });
    res.status(201).json(cotacao);
  } catch (e) { fail(res, e); }
});

router.get("/cotacoes", async (req, res) => {
  try {
    const { obraId, status, de, ate, produtoId } = req.query;
    const page = Math.max(1, Number(req.query.pagina) || 1), limite = Math.min(100, Math.max(1, Number(req.query.limite) || 25));
    const rows = await prisma.cotacaoEnvio.findMany({ where: { obraId: obraId ? Number(obraId) : undefined, status: status || undefined, dataCriacao: de || ate ? { gte: de ? new Date(de) : undefined, lte: ate ? new Date(ate) : undefined } : undefined, itens: produtoId ? { some: { produtoId: Number(produtoId) } } : undefined }, include: { obra: true, usuario: { select: { id: true, nome: true } }, itens: { include: { produto: true, aplicacao: true } }, fornecedores: { include: { fornecedor: true } }, respostas: { include: { fornecedor: true, itens: { include: { produto: true } } } } }, orderBy: { dataCriacao: "desc" }, skip: (page - 1) * limite, take: limite });
    res.json(rows);
  } catch (e) { fail(res, e); }
});

router.get("/cotacoes/:id/comparativo", async (req, res) => {
  try {
    const cotacao = await prisma.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(req.params.id) }, include: { itens: { include: { produto: true, aplicacao: true, ofertas: { include: { resposta: { include: { fornecedor: true } } } } } } } });
    res.json(cotacao.itens.map(item => ({ itemSolicitadoId: item.id, produto: item.produto.nome, unidade: item.unidade, quantidadeSolicitada: item.quantidadeSolicitada, aplicacao: item.aplicacao?.nome || null, ofertas: item.ofertas.map(o => ({ fornecedor: o.resposta.fornecedor.nome, status: o.indisponivel ? "INDISPONIVEL" : o.status, quantidade: o.quantidadeOfertada, valorUnitario: o.valorUnitario, total: Number(o.quantidadeOfertada) * Number(o.valorUnitario), adicional: o.adicional })) })));
  } catch (e) { fail(res, e); }
});

router.get("/compras", async (req, res) => {
  try {
    res.json(await prisma.compra.findMany({ where: { obraId: req.query.obraId ? Number(req.query.obraId) : undefined, status: req.query.status || undefined, dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(req.query.ate) : undefined } : undefined }, include: { obra: true, cotacao: true, selecoes: { include: { oferta: { include: { resposta: { include: { fornecedor: true } }, produto: true } }, aprovador: { select: { nome: true } } } }, pedidos: { include: { fornecedor: true, itens: { include: { recebimentos: true }, }, notasFiscais: true } } }, orderBy: { dataCriacao: "desc" } }));
  } catch (e) { fail(res, e); }
});

router.post("/cotacoes/:id/enviar", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const c = await prisma.cotacaoEnvio.findUnique({ where: { id }, include: { obra: true, itens: { include: { produto: true } }, fornecedores: { include: { fornecedor: true } } } });
    if (!c || !c.fornecedores.length) throw new Error("Cotação não encontrada ou sem fornecedores.");
    const resultados = await Promise.all(c.fornecedores.map(async p => {
      const mensagem = [`Solicitação ${c.id} - ${c.obra.nome}`, ...c.itens.map(i => `• ${i.produto.nome}: ${i.quantidadeSolicitada} ${i.unidade}`)].join("\n");
      let status = "ENVIADO", erro = null, identificadorExterno = null;
      try { ({ identificadorExterno } = await whatsapp.enviar({ telefone: p.fornecedor.telefone, mensagem, idempotencia: `cotacao-${c.id}-fornecedor-${p.fornecedorId}` })); }
      catch (e) { status = "FALHOU"; erro = e.message; }
      await prisma.$transaction([prisma.cotacaoEnvioFornecedor.update({ where: { id: p.id }, data: { statusEnvio: status, dataEnvio: status === "ENVIADO" ? new Date() : undefined, erro, identificadorExterno, telefone: p.fornecedor.telefone } }), prisma.historicoEnvioMensagem.create({ data: { cotacaoEnvioFornecedorId: p.id, telefone: p.fornecedor.telefone || "", mensagem, status, erro, identificadorExterno } })]);
      return { fornecedorId: p.fornecedorId, status, erro };
    }));
    const status = resultados.some(r => r.status === "ENVIADO") ? "ENVIADA" : "RASCUNHO";
    await prisma.cotacaoEnvio.update({ where: { id }, data: { status } });
    await prisma.historicoStatus.create({ data: { entidadeTipo: "CotacaoEnvio", entidadeId: id, statusAnterior: c.status, statusNovo: status, usuarioId: req.usuario.id, cotacaoEnvioId: id } });
    res.json(resultados);
  } catch (e) { fail(res, e); }
});

router.post("/respostas", async (req, res) => {
  try {
    const { cotacaoEnvioId, fornecedorId, observacao, itens = [] } = req.body;
    const ofertas = itens.map(i => {
      const quantidade = Number(i.quantidadeOfertada ?? 0), valor = Number(i.valorUnitario ?? 0), indisponivel = Boolean(i.indisponivel);
      if (!Number.isFinite(quantidade) || quantidade < 0 || !Number.isFinite(valor) || valor < 0 || (indisponivel && (quantidade !== 0 || valor !== 0))) throw new Error("Oferta deve ter quantidades e valores não negativos; indisponíveis devem usar zero.");
      if (!i.cotacaoEnvioItemId && !i.adicional) throw new Error("Itens fora da solicitação devem ser marcados como adicionais.");
      return { cotacaoEnvioItemId: i.cotacaoEnvioItemId ? Number(i.cotacaoEnvioItemId) : null, produtoId: Number(i.produtoId), quantidadeOfertada: quantidade, valorUnitario: valor, indisponivel, adicional: Boolean(i.adicional), observacao: i.observacao };
    });
    const resposta = await prisma.cotacaoResposta.create({ data: { cotacaoEnvioId: Number(cotacaoEnvioId), fornecedorId: Number(fornecedorId), usuarioPreenchimentoId: req.usuario.id, observacao, itens: { create: ofertas } }, include: { itens: true, fornecedor: true } });
    res.status(201).json(resposta);
  } catch (e) { fail(res, e); }
});

router.post("/respostas/:id/encaminhar", async (req, res) => {
  try {
    const row = await prisma.cotacaoResposta.update({ where: { id: Number(req.params.id) }, data: { status: "ENCAMINHADA", dataResposta: new Date() }, include: { cotacao: true } });
    await prisma.cotacaoEnvio.update({ where: { id: row.cotacaoEnvioId }, data: { status: "EM_ANALISE" } });
    res.json(row);
  } catch (e) { fail(res, e); }
});

router.post("/compras/aprovar", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const { cotacaoEnvioId, itens } = req.body;
    if (!Array.isArray(itens) || !itens.length) throw new Error("Informe itens para decisão.");
    const compra = await prisma.$transaction(async tx => {
      const cotacao = await tx.cotacaoEnvio.findUniqueOrThrow({ where: { id: Number(cotacaoEnvioId) }, include: { itens: true } });
      const c = await tx.compra.upsert({ where: { cotacaoEnvioId: cotacao.id }, update: {}, create: { obraId: cotacao.obraId, cotacaoEnvioId: cotacao.id } });
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
      await tx.historicoStatus.create({ data: { entidadeTipo: "Compra", entidadeId: c.id, statusNovo: c.status, usuarioId: req.usuario.id, compraId: c.id, cotacaoEnvioId: cotacao.id } });
      return tx.compra.findUnique({ where: { id: c.id }, include: { selecoes: { include: { oferta: { include: { resposta: { include: { fornecedor: true } }, produto: true } }, aprovador: { select: { nome: true } } } } } });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(compra);
  } catch (e) { fail(res, e); }
});

router.post("/compras/:id/pedidos", permitir("ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"), async (req, res) => {
  try {
    const compraId = Number(req.params.id);
    const rows = await prisma.$transaction(async tx => {
      const aprovados = await tx.selecaoCompraItem.findMany({ where: { compraId, status: "APROVADA" }, include: { oferta: { include: { resposta: true } } } });
      if (!aprovados.length) throw new Error("A compra não possui itens aprovados.");
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

router.patch("/pedidos/:id/confirmar", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = await prisma.$transaction(async tx => {
      const current = await tx.pedidoCompra.findUniqueOrThrow({ where: { id } });
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
    if (Number(valorTotal) < 0) throw new Error("Valor não pode ser negativo.");
    res.status(201).json(await prisma.notaFiscal.create({ data: { pedidoCompraId: Number(req.params.id), numero, dataEmissao: new Date(dataEmissao), valorTotal: Number(valorTotal), arquivoReferencia } }));
  } catch (e) { fail(res, e); }
});

router.post("/pedidos/itens/:id/recebimentos", async (req, res) => {
  try {
    const itemId = Number(req.params.id), quantidadeRecebida = Number(req.body.quantidadeRecebida);
    const result = await prisma.$transaction(async tx => {
      const item = await tx.pedidoCompraItem.findUniqueOrThrow({ where: { id: itemId }, include: { pedido: true } });
      const anterior = await tx.recebimentoItem.aggregate({ where: { pedidoCompraItemId: itemId }, _sum: { quantidadeRecebida: true } });
      if (quantidadeRecebida <= 0 || Number(anterior._sum.quantidadeRecebida || 0) + quantidadeRecebida > Number(item.quantidade)) throw new Error("Quantidade recebida inválida ou acima do saldo do pedido.");
      const recebimento = await tx.recebimentoItem.create({ data: { pedidoCompraItemId: itemId, quantidadeRecebida, usuarioId: req.usuario.id, observacao: req.body.observacao } });
      const total = await tx.pedidoCompraItem.findMany({ where: { pedidoCompraId: item.pedidoCompraId }, include: { recebimentos: true } });
      const concluido = total.every(i => i.recebimentos.reduce((s, r) => s + Number(r.quantidadeRecebida), 0) >= Number(i.quantidade));
      const iniciado = total.some(i => i.recebimentos.length);
      await tx.pedidoCompra.update({ where: { id: item.pedidoCompraId }, data: { status: concluido ? "RECEBIDO" : iniciado ? "PARCIALMENTE_RECEBIDO" : item.pedido.status } });
      await tx.historicoStatus.create({ data: { entidadeTipo: "RecebimentoItem", entidadeId: recebimento.id, statusNovo: concluido ? "RECEBIDO" : "PARCIALMENTE_RECEBIDO", usuarioId: req.usuario.id, pedidoCompraId: item.pedidoCompraId, observacao: `Recebimento de ${quantidadeRecebida}` } });
      return recebimento;
    });
    res.status(201).json(result);
  } catch (e) { fail(res, e); }
});

router.get("/relatorios/gastos", async (req, res) => {
  try {
    const purchases = await prisma.pedidoCompra.findMany({ where: { status: { not: "CANCELADO" }, compra: { obraId: req.query.obraId ? Number(req.query.obraId) : undefined, dataCriacao: req.query.de || req.query.ate ? { gte: req.query.de ? new Date(req.query.de) : undefined, lte: req.query.ate ? new Date(req.query.ate) : undefined } : undefined } }, include: { fornecedor: true, compra: { include: { obra: true } }, itens: { include: { selecao: { include: { oferta: { include: { produto: true } } } } } } } });
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
      pdf.pipe(res); pdf.fontSize(18).text("Relatório de gastos", { align: "center" });
      pdf.moveDown().fontSize(9).text(`Filtros: obra=${req.query.obraId || "todas"}; período=${req.query.de || "início"} até ${req.query.ate || "hoje"}; agrupamento=${chave}`);
      pdf.moveDown().fontSize(10).text("Obra | Fornecedor | Produto | Quantidade | Unitário | Total | Data");
      for (const x of linhas) {
        if (pdf.y > 520) pdf.addPage();
        pdf.fontSize(8).text(`${x.obra} | ${x.fornecedor} | ${x.produto} | ${x.quantidade} | R$ ${x.valorUnitario.toFixed(2)} | R$ ${x.total.toFixed(2)} | ${x.data.slice(0,10)}`);
      }
      pdf.end(); return;
    }
    res.json({ filtros: req.query, resumo, linhas });
  } catch (e) { fail(res, e); }
});

router.get("/historico", async (req, res) => {
  try { res.json(await prisma.historicoStatus.findMany({ where: { entidadeTipo: req.query.tipo, entidadeId: req.query.id ? Number(req.query.id) : undefined }, include: { usuario: { select: { id: true, nome: true } } }, orderBy: { dataHora: "desc" }, take: Math.min(Number(req.query.limite) || 100, 500) })); }
  catch (e) { fail(res, e); }
});
export default router;
