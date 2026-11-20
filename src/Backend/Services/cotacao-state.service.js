const TRANSITIONS = {
  RASCUNHO: new Set(["ENVIADA", "CANCELADA"]),
  ENVIADA: new Set(["EM_ANDAMENTO", "ENCERRADA", "CANCELADA"]),
  EM_ANDAMENTO: new Set(["CONCLUIDA", "ENCERRADA", "CANCELADA"]),
  CONCLUIDA: new Set(),
  ENCERRADA: new Set(),
  CANCELADA: new Set(),
};

export function validarTransicaoCotacao(atual, proximo, { compraAprovada = false, respostasPendentes = false } = {}) {
  if (!TRANSITIONS[atual]?.has(proximo)) throw new Error(`Transição de cotação inválida: ${atual} → ${proximo}.`);
  if (proximo === "CONCLUIDA" && !compraAprovada) throw new Error("Uma cotação só pode ser concluída após aprovação de uma compra.");
  if (proximo === "ENCERRADA" && respostasPendentes) throw new Error("Não é possível encerrar enquanto houver respostas pendentes.");
  return proximo;
}

export function respostasEstaoPendentes(respostas, fornecedores) {
  return fornecedores.some(({ fornecedorId }) => {
    const resposta = respostas.find(row => row.fornecedorId === fornecedorId);
    return !resposta || resposta.status === "PREENCHIMENTO";
  });
}
