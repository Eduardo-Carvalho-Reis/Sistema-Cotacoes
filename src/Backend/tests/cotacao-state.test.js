import test from "node:test";
import assert from "node:assert/strict";
import { validarTransicaoCotacao, respostasEstaoPendentes } from "../Services/cotacao-state.service.js";
import { calcularStatusEntrega } from "../Services/delivery.service.js";

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

test("entrega parcial não conclui o item e prazo vencido marca atraso", () => {
  const agora = new Date("2026-11-18T12:00:00Z");
  assert.equal(calcularStatusEntrega({ quantidade: 10, recebida: 4, agora }), "PARCIALMENTE_ENTREGUE");
  assert.equal(calcularStatusEntrega({ quantidade: 10, recebida: 4, dataPrevista: "2026-11-17T00:00:00Z", agora }), "ATRASADA");
  assert.equal(calcularStatusEntrega({ quantidade: 10, recebida: 10, dataPrevista: "2026-11-17T00:00:00Z", agora }), "ENTREGUE");
});
