import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// El entorno debe fijarse ANTES de importar los módulos (config se lee al importar).
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "mm-bot-"));
process.env.TELEGRAM_LINK_CODE = "codigo-secreto-123";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.PAUSED = "false";

const { handleMessage, parseCommand, _setReply } = await import("../src/commands.mjs");
const { listIdeas } = await import("../src/state.mjs");
const { isPaused, schedule } = await import("../src/runtime.mjs");
const { isLinked } = await import("../src/telegram.mjs");

const sent = [];
_setReply(async (chatId, text) => { sent.push({ chatId: String(chatId), text }); });
const say = async (chatId, text, type = "private") => {
  sent.length = 0;
  await handleMessage({ chat: { id: chatId, type }, from: { first_name: "Cliente", last_name: "Prueba" }, text });
  return sent.map((s) => s.text).join("\n");
};

test("parseCommand entiende argumentos y @bot", () => {
  assert.deepEqual(parseCommand("/idea  un post   sobre duchas"), { cmd: "idea", args: "un post   sobre duchas" });
  assert.deepEqual(parseCommand("/estado@MillimeterBot"), { cmd: "estado", args: "" });
  assert.equal(parseCommand("hola"), null);
});

test("un chat sin vincular no puede dar órdenes", async () => {
  for (const c of ["/forzar", "/idea un post sobre chimeneas de piedra", "/pausar", "/estado", "/hora 9:00"]) {
    const out = await say(111, c);
    assert.match(out, /no está vinculado/i, c);
  }
  assert.equal(listIdeas().length, 0);
  assert.equal(isPaused(), false);
});

test("los grupos se ignoran por completo", async () => {
  assert.equal(await say(-100, "/vincular codigo-secreto-123", "group"), "");
  assert.equal(isLinked(-100), false);
});

test("código incorrecto no vincula y se bloquea tras 5 fallos", async () => {
  for (let i = 0; i < 5; i++) assert.match(await say(222, "/vincular mal"), /incorrecto/i);
  assert.match(await say(222, "/vincular codigo-secreto-123"), /Demasiados intentos/);
  assert.equal(isLinked(222), false);
});

test("con el código correcto se vincula y puede dar órdenes", async () => {
  assert.match(await say(333, "/vincular codigo-secreto-123"), /Vinculado, Cliente Prueba/);
  assert.equal(isLinked(333), true);

  assert.match(await say(333, "/idea corta"), /más de detalle/);
  assert.match(await say(333, "/idea Un post sobre cómo las chimeneas de MILLIMETER renuevan un salón"), /Idea guardada \(#1/);
  assert.equal(listIdeas().length, 1);
  assert.match(await say(333, "/ideas"), /1\. Un post sobre cómo las chimeneas/);
  assert.match(await say(333, "/borrar_idea 1"), /eliminada/);
  assert.equal(listIdeas().length, 0);

  assert.match(await say(333, "/hora 25:00"), /Formato/);
  assert.match(await say(333, "/hora 11:30"), /11:30/);
  assert.deepEqual(schedule(), { hour: 11, minute: 30 });

  assert.match(await say(333, "/pausar"), /pausadas/);
  assert.equal(isPaused(), true);
  assert.match(await say(333, "/reanudar"), /reanudadas/);
  assert.equal(isPaused(), false);

  assert.match(await say(333, "/estado"), /Estado/);
  assert.match(await say(333, "/comandoinexistente"), /No conozco/);
  assert.match(await say(333, "texto suelto"), /Usa un comando/);
});

test("la idea se limpia de caracteres de control y respeta el largo", async () => {
  assert.match(await say(333, `/idea ${"x".repeat(401)}`), /muy larga/);
  await say(333, "/idea Post sobre\u0000 duchas\ncon\tpocas juntas en piedra natural");
  assert.equal(listIdeas()[0].text, "Post sobre duchas con pocas juntas en piedra natural");
});

test("/desvincular y /quitar retiran el acceso", async () => {
  await say(444, "/vincular codigo-secreto-123");
  assert.equal(isLinked(444), true);
  assert.match(await say(444, "/desvincular"), /desvinculado/);
  assert.equal(isLinked(444), false);
  assert.match(await say(444, "/estado"), /no está vinculado/);
});
