export function calcularRankingFornecedores(linhas) {
  const totalGeral = linhas.reduce((sum, row) => sum + row.total, 0);
  const agrupado = Map.groupBy(linhas, row => row.fornecedorId);
  return [...agrupado.values()].map(rows => ({
    fornecedorId: rows[0].fornecedorId,
    fornecedor: rows[0].fornecedor,
    totalComprado: rows.reduce((sum, row) => sum + row.total, 0),
    quantidadeCompras: new Set(rows.map(row => row.compraId)).size,
    variedadeProdutos: new Set(rows.map(row => row.produtoId)).size,
    participacaoPercentual: totalGeral ? rows.reduce((sum, row) => sum + row.total, 0) / totalGeral * 100 : 0,
  })).sort((a, b) => b.totalComprado - a.totalComprado);
}

export function agruparGastosPorObraMes(linhas) {
  const agrupado = Map.groupBy(linhas, row => `${row.obraId}:${row.mes}`);
  return [...agrupado.values()].map(rows => ({ obraId: rows[0].obraId, obra: rows[0].obra, mes: rows[0].mes, total: rows.reduce((sum, row) => sum + row.total, 0) })).sort((a, b) => a.mes.localeCompare(b.mes) || a.obra.localeCompare(b.obra));
}

export function calcularEstatisticasPreco(linhas) {
  const agrupado = Map.groupBy(linhas, row => `${row.produtoId}:${row.unidade}`);
  return [...agrupado.values()].map(rows => {
    const precos = rows.map(row => row.valorUnitario).sort((a, b) => a - b);
    return { produtoId: rows[0].produtoId, produto: rows[0].produto, unidade: rows[0].unidade, menorPreco: precos[0], precoMedio: precos.reduce((sum, value) => sum + value, 0) / precos.length, maiorPreco: precos.at(-1), observacoes: rows };
  });
}
