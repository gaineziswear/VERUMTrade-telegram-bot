/**
 * Minimal Telegram Bot API adapter for the VERUM delivery worker.
 *
 * Credentials and chat identifiers are injected at runtime. This module never
 * reads process.env, logs credentials, or decides whether a signal is eligible.
 */
const TELEGRAM_API = "https://api.telegram.org";

function validateMessage({ chatId, text, parseMode }) {
  if ((typeof chatId !== "string" && typeof chatId !== "number") || String(chatId).trim() === "") {
    throw new TypeError("A Telegram chatId is required");
  }
  if (typeof text !== "string" || text.trim() === "") {
    throw new TypeError("Telegram message text is required");
  }
  if (Array.from(text).length > 4096) {
    throw new RangeError("Telegram messages cannot exceed 4096 characters");
  }
  if (parseMode !== undefined && !["HTML", "MarkdownV2"].includes(parseMode)) {
    throw new TypeError("parseMode must be HTML or MarkdownV2");
  }
}

function apiError(message, { status = null, retryAfter = null, description = "Telegram API request failed" } = {}) {
  const error = new Error(description);
  error.name = "TelegramApiError";
  error.status = status;
  error.retryAfterSeconds = retryAfter;
  error.retryable = status === 429 || (Number.isInteger(status) && status >= 500);
  error.telegramMessage = message ?? null;
  return error;
}

export function createTelegramAdapter({
  botToken,
  fetchImpl = globalThis.fetch,
  apiBase = TELEGRAM_API,
} = {}) {
  if (typeof botToken !== "string" || botToken.trim() === "") {
    throw new TypeError("A Telegram bot token must be injected at runtime");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");

  const endpoint = `${apiBase.replace(/\/$/, "")}/bot${encodeURIComponent(botToken)}`;

  async function request(method, payload) {
    let response;
    try {
      response = await fetchImpl(`${endpoint}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      const error = apiError(null, { description: "Telegram network request failed; delivery outcome may be unknown" });
      error.retryable = false;
      error.ambiguous = true;
      throw error;
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw apiError(null, { status: response.status, description: "Telegram returned an unreadable response" });
    }

    if (!response.ok || body?.ok !== true) {
      const retryAfter = body?.parameters?.retry_after ?? null;
      throw apiError(body?.result?.message_id ?? null, {
        status: response.status,
        retryAfter,
        description: body?.description || "Telegram rejected the request",
      });
    }
    return body.result;
  }

  return Object.freeze({
    async verify() {
      const result = await request("getMe", {});
      return { id: result.id, isBot: result.is_bot === true, username: result.username ?? null };
    },

    async sendMessage({ chatId, text, parseMode } = {}) {
      validateMessage({ chatId, text, parseMode });
      const payload = { chat_id: chatId, text, disable_web_page_preview: true };
      if (parseMode) payload.parse_mode = parseMode;
      const result = await request("sendMessage", payload);
      return {
        messageId: result.message_id,
        chatId: result.chat?.id ?? chatId,
        date: result.date,
        text: result.text ?? text,
      };
    },

    async sendStarsInvoice({ chatId, title, description, payload, amountStars } = {}) {
      if ((typeof chatId !== "string" && typeof chatId !== "number") || String(chatId).trim() === "") throw new TypeError("A Telegram chatId is required");
      if (typeof title !== "string" || !title.trim() || title.length > 32) throw new TypeError("Invoice title must be 1-32 characters");
      if (typeof description !== "string" || !description.trim() || description.length > 255) throw new TypeError("Invoice description must be 1-255 characters");
      if (typeof payload !== "string" || payload.length < 1 || payload.length > 128) throw new TypeError("Invoice payload must be 1-128 characters");
      if (!Number.isSafeInteger(amountStars) || amountStars < 5 || amountStars > 10000) throw new RangeError("Stars amount must be an integer from 5 to 10000");
      const result = await request("sendInvoice", {
        chat_id: chatId, title, description, payload, currency: "XTR",
        prices: [{ label: title, amount: amountStars }],
        subscription_period: 2592000,
      });
      return { messageId: result.message_id, chatId: result.chat?.id ?? chatId };
    },

    async answerPreCheckoutQuery({ queryId, ok, errorMessage } = {}) {
      if (typeof queryId !== "string" || !queryId) throw new TypeError("Pre-checkout queryId is required");
      if (typeof ok !== "boolean") throw new TypeError("Pre-checkout result must be boolean");
      if (!ok && (typeof errorMessage !== "string" || !errorMessage.trim())) throw new TypeError("A rejection reason is required");
      return request("answerPreCheckoutQuery", {
        pre_checkout_query_id: queryId, ok,
        ...(ok ? {} : { error_message: errorMessage.slice(0, 200) }),
      });
    },

    async createSingleUseInviteLink({ chatId, name = "VERUM VIP", expireAt } = {}) {
      if ((typeof chatId !== "string" && typeof chatId !== "number") || String(chatId).trim() === "") throw new TypeError("A Telegram chatId is required");
      if (!Number.isInteger(expireAt) || expireAt <= Math.floor(Date.now() / 1000)) throw new TypeError("expireAt must be a future Unix timestamp");
      const result = await request("createChatInviteLink", {
        chat_id: chatId, name: String(name).slice(0, 32),
        expire_date: expireAt, member_limit: 1, creates_join_request: false,
      });
      return { inviteLink: result.invite_link, expireAt: result.expire_date, memberLimit: result.member_limit };
    },

    async removeMember({ chatId, userId } = {}) {
      if ((typeof chatId !== "string" && typeof chatId !== "number") || String(chatId).trim() === "") throw new TypeError("A Telegram chatId is required");
      if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new TypeError("A valid Telegram userId is required");
      const result = await request("banChatMember", { chat_id: chatId, user_id: Number(userId) });
      return { ok: result === true };
    },

    async restoreMemberAccess({ chatId, userId } = {}) {
      if ((typeof chatId !== "string" && typeof chatId !== "number") || String(chatId).trim() === "") throw new TypeError("A Telegram chatId is required");
      if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) throw new TypeError("A valid Telegram userId is required");
      const result = await request("unbanChatMember", { chat_id: chatId, user_id: Number(userId), only_if_banned: true });
      return { ok: result === true };
    },
  });
}

/** Escape untrusted plain text before interpolating it into Telegram HTML. */
export function escapeTelegramHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
