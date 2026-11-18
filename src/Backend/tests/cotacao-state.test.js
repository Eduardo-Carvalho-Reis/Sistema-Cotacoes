import test from "node:test";
import assert from "node:assert/strict";
import { validarTransicaoCotacao, respostasEstaoPendentes } from "../Services/cotacao-state.service.js";

test("cotação enviada pode entrar em andamento e ser concluída após aprovação", () => {
  assert.equal(validarTransicaoCotacao("ENVIADA", "EM_ANDAMENTO"), "EM_ANDAMENTO");
  assert.equal(validarTransicaoCotacao("EM_ANDAMENTO", "CONCLUIDA", { compraAprovada: true }), "CONCLUIDA");
});

test("bloqueia conclusão sem compra aprovada e encerramento com resposta pendente", () => {
  assert.throws(() => validarTransicaoCotacao("EM_ANDAMENTO", "CONCLUIDA"), /compra/);
  assert.throws(() => validarTransicaoCotacao("EM_ANDAMENTO", "ENCERRADA", { respostasPendentes: true }), /pendentes/);
});

test("não permite transições para estados terminais", () => {
  assert.throws(() => validarTransicaoCotacao("CANCELADA", "EM_ANDAMENTO"), /inválida/);
  assert.throws(() => validarTransicaoCotacao("CONCLUIDA", "CANCELADA"), /inválida/);
});

test("resposta em preenchimento ou ausente mantém a cotação pendente", () => {
  const fornecedores = [{ fornecedorId: 1 }, { fornecedorId: 2 }];
  assert.equal(respostasEstaoPendentes([{ fornecedorId: 1, status: "ENCAMINHADA" }], fornecedores), true);
  assert.equal(respostasEstaoPendentes([{ fornecedorId: 1, status: "ENCAMINHADA" }, { fornecedorId: 2, status: "PREENCHIMENTO" }], fornecedores), true);
  assert.equal(respostasEstaoPendentes([{ fornecedorId: 1, status: "ENCAMINHADA" }, { fornecedorId: 2, status: "ENCERRADA" }], fornecedores), false);
});
