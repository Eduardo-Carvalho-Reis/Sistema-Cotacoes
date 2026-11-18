import test from "node:test";
import assert from "node:assert/strict";
import { sessionNameFor } from "../Services/wppconnect-session.utils.js";

test("cada usuário recebe um nome de sessão WPPConnect isolado", () => {
  assert.equal(sessionNameFor(7), "orbe-user-7");
  assert.notEqual(sessionNameFor(7), sessionNameFor(8));
});
