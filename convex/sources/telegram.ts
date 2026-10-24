// Telegram Bot API sender (sendMessage only). Used by convex/brief.ts. Runs in the default Convex
// runtime (plain fetch). The bot token never leaves this function, never appears in errors.

export type TelegramResult = { ok: true; messageId: number } | { ok: false; error: string };

export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
}

/** Sends one HTML message to TELEGRAM_CHAT_ID. Telegram caps a message at 4096 characters. */
export async function sendTelegram(html: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant sur Convex" };
  const text = html.length > 4000 ? `${html.slice(0, 3990)}\n…` : html;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string; result?: { message_id?: number } } | null;
    if (!res.ok || !body?.ok) return { ok: false, error: `Telegram ${res.status}: ${body?.description ?? "réponse illisible"}`.slice(0, 300) };
    return { ok: true, messageId: body.result?.message_id ?? 0 };
  } catch (err) {
    // fetch errors may echo the URL (which holds the token): keep only a generic reason.
    const name = err instanceof Error ? err.name : "Error";
    return { ok: false, error: `Telegram injoignable (${name})` };
  }
}
