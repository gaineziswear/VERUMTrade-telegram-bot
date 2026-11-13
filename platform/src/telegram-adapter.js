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
  });
}

/** Escape untrusted plain text before interpolating it into Telegram HTML. */
export function escapeTelegramHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
