import test from "node:test";
import assert from "node:assert/strict";
import { createTelegramAdapter } from "../src/telegram-adapter.js";

const ok = result => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });

test("creates a recurring Telegram Stars invoice link using XTR", async () => {
  let call;
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async (url, init) => {
      call = { url, payload: JSON.parse(init.body) };
      return ok("https://t.me/$verum_invoice_link");
    },
  });
  const invoice = await adapter.createStarsInvoiceLink({
    title: "VERUM VIP", description: "30-day access",
    payload: "verum:stars:v1:invoice_123456", amountStars: 500,
  });
  assert.equal(call.url.endsWith("/createInvoiceLink"), true);
  assert.equal(call.payload.currency, "XTR");
  assert.equal("provider_token" in call.payload, false);
  assert.equal("chat_id" in call.payload, false);
  assert.equal(call.payload.subscription_period, 2592000);
  assert.deepEqual(call.payload.prices, [{ label: "VERUM VIP", amount: 500 }]);
  assert.deepEqual(invoice, { invoiceLink: "https://t.me/$verum_invoice_link" });
});

test("answers pre-checkout with an explicit decision", async () => {
  let call;
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async (url, init) => {
      call = { url, payload: JSON.parse(init.body) };
      return ok(true);
    },
  });
  await adapter.answerPreCheckoutQuery({ queryId: "query-1", ok: false, errorMessage: "Invoice expired" });
  assert.equal(call.url.endsWith("/answerPreCheckoutQuery"), true);
  assert.deepEqual(call.payload, { pre_checkout_query_id: "query-1", ok: false, error_message: "Invoice expired" });
});

test("creates a one-use, expiring access invite", async () => {
  let payload;
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async (url, init) => {
      payload = JSON.parse(init.body);
      return ok({ invite_link: "https://t.me/+singleUse", expire_date: payload.expire_date, member_limit: 1 });
    },
  });
  const expireAt = Math.floor(Date.now() / 1000) + 600;
  const result = await adapter.createSingleUseInviteLink({ chatId: "-100123", expireAt });
  assert.equal(payload.member_limit, 1);
  assert.equal(payload.creates_join_request, false);
  assert.equal(result.inviteLink, "https://t.me/+singleUse");
  await assert.rejects(adapter.createSingleUseInviteLink({ chatId: "-100123", expireAt: 1 }), /future/);
});

test("supports membership expiry and reinstatement operations", async () => {
  const calls = [];
  const adapter = createTelegramAdapter({
    botToken: "123:secret",
    fetchImpl: async (url, init) => { calls.push({ method: url.split("/").pop(), payload: JSON.parse(init.body) }); return ok(true); },
  });
  await adapter.removeMember({ chatId: "-100123", userId: 77 });
  await adapter.restoreMemberAccess({ chatId: "-100123", userId: 77 });
  assert.deepEqual(calls.map(x => x.method), ["banChatMember", "unbanChatMember"]);
  assert.equal(calls[1].payload.only_if_banned, true);
});
