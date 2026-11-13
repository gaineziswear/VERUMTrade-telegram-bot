import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramAdapter, escapeTelegramHtml } from "../src/telegram-adapter.js";

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("requires a bot token and validates outgoing messages", async () => {
  assert.throws(() => createTelegramAdapter(), /bot token/);
  const adapter = createTelegramAdapter({ botToken: "123:secret", fetchImpl: async () => response({ ok: true, result: {} }) });
  await assert.rejects(adapter.sendMessage({ chatId: "-1001", text: " " }), /text is required/);
  await assert.rejects(adapter.sendMessage({ chatId: "", text: "hello" }), /chatId is required/);
  await assert.rejects(adapter.sendMessage({ chatId: "-1001", text: "x".repeat(4097) }), /4096/);
});

test("sends a Telegram message and returns a normalized receipt", async () => {
  let request;
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async (url, init) => {
      request = { url, init, payload: JSON.parse(init.body) };
      return response({ ok: true, result: { message_id: 77, date: 1794500000, text: "hello", chat: { id: -1001 } } });
    },
  });
  const receipt = await adapter.sendMessage({ chatId: "-1001", text: "hello", parseMode: "HTML" });
  assert.equal(request.url.endsWith("/sendMessage"), true);
  assert.equal(request.payload.chat_id, "-1001");
  assert.equal(request.payload.parse_mode, "HTML");
  assert.equal(receipt.messageId, 77);
  assert.equal(receipt.chatId, -1001);
});

test("exposes Telegram rate limits as retryable with retry-after metadata", async () => {
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async () => response({ ok: false, description: "Too Many Requests", parameters: { retry_after: 12 } }, 429),
  });
  await assert.rejects(adapter.sendMessage({ chatId: "-1001", text: "hello" }), error => {
    assert.equal(error.name, "TelegramApiError");
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfterSeconds, 12);
    return true;
  });
});

test("does not label network timeouts as safe retries because delivery may be ambiguous", async () => {
  const adapter = createTelegramAdapter({ botToken: "123:secret", fetchImpl: async () => { throw new Error("socket closed"); } });
  await assert.rejects(adapter.sendMessage({ chatId: "-1001", text: "hello" }), error => {
    assert.equal(error.ambiguous, true);
    assert.equal(error.retryable, false);
    return true;
  });
});

test("verifies bot identity without exposing the token", async () => {
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async () => response({ ok: true, result: { id: 123, is_bot: true, username: "verum_bot" } }),
  });
  assert.deepEqual(await adapter.verify(), { id: 123, isBot: true, username: "verum_bot" });
});

test("escapes untrusted text for Telegram HTML", () => {
  assert.equal(escapeTelegramHtml("<VERUM & friends>"), "&lt;VERUM &amp; friends&gt;");
});
