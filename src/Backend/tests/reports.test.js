import test from "node:test";
import assert from "node:assert/strict";
import { calcularRankingFornecedores, agruparGastosPorObraMes, agruparGastosPorCategoria, calcularEstatisticasPreco } from "../Services/reports.service.js";

const rows = [
  { compraId: 1, obraId: 4, obra: "Obra A", mes: "2026-01", fornecedorId: 2, fornecedor: "Fornecedor A", produtoId: 8, produto: "Cimento", unidade: "SC", total: 100, valorUnitario: 10 },
  { compraId: 1, obraId: 4, obra: "Obra A", mes: "2026-01", fornecedorId: 2, fornecedor: "Fornecedor A", produtoId: 9, produto: "Areia", unidade: "M3", total: 50, valorUnitario: 5 },
  { compraId: 2, obraId: 5, obra: "Obra B", mes: "2026-02", fornecedorId: 3, fornecedor: "Fornecedor B", produtoId: 8, produto: "Cimento", unidade: "SC", total: 150, valorUnitario: 15 },
];

test("ranking calcula total, compras unicas, variedade e participacao", () => {
  const ranking = calcularRankingFornecedores(rows);
  assert.equal(ranking[0].fornecedor, "Fornecedor A");
  assert.equal(ranking[0].quantidadeCompras, 1);
  assert.equal(ranking[0].variedadeProdutos, 2);
  assert.equal(ranking[0].participacaoPercentual, 50);
});

test("gastos por obra mantem agregacao mensal", () => {
  assert.deepEqual(agruparGastosPorObraMes(rows).map(row => [row.obra, row.mes, row.total]), [["Obra A", "2026-01", 150], ["Obra B", "2026-02", 150]]);
});

test("gastos por categoria calcula participacao sobre despesas reais", () => {
  const categorized = rows.map((row, index) => ({ ...row, categoria: index === 0 ? "Estrutura" : "Acabamento" }));
  const result = agruparGastosPorCategoria(categorized);
  assert.equal(result[0].categoria, "Acabamento");
  assert.equal(result[0].total, 200);
  assert.equal(result[0].participacaoPercentual, 200 / 300 * 100);
});

test("estatisticas de preco separam produtos e unidades", () => {
  const result = calcularEstatisticasPreco(rows);
  const cimento = result.find(row => row.produtoId === 8);
  assert.equal(cimento.menorPreco, 10);
  assert.equal(cimento.precoMedio, 12.5);
  assert.equal(cimento.maiorPreco, 15);
  assert.equal(result.length, 2);
});
