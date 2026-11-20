import test from "node:test";
import assert from "node:assert/strict";
import { assertObraAccess, obraScope, isAdminUser } from "../Services/permissions.service.js";

test("standard user can access only its assigned worksite", () => {
  const user = { id: 9, perfil: "USUARIO_PADRAO", obraId: 4 };
  assert.doesNotThrow(() => assertObraAccess(user, 4));
  assert.throws(() => assertObraAccess(user, 5), error => error.status === 403);
  assert.deepEqual(obraScope(user), { obraId: 4 });
  assert.deepEqual(obraScope(user, "cotacaoEnvio.obraId"), { "cotacaoEnvio.obraId": 4 });
});

test("admin has global worksite scope and legacy system profile remains administrative", () => {
  assert.deepEqual(obraScope({ perfil: "ADMINISTRADOR" }), {});
  assert.equal(isAdminUser({ perfil: "ADMINISTRADOR_SISTEMA" }), true);
  assert.doesNotThrow(() => assertObraAccess({ perfil: "ADMINISTRADOR" }, 99));
});

test("unassigned standard user fails closed", () => {
  const user = { perfil: "USUARIO_PADRAO", obraId: null };
  assert.throws(() => assertObraAccess(user, 1), error => error.status === 403);
  assert.deepEqual(obraScope(user), { obraId: -1 });
});
