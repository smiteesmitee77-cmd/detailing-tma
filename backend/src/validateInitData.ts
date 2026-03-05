import crypto from "crypto";

export type InitDataUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

/** Максимальный возраст initData — 24 часа */
const MAX_AGE_SECONDS = 24 * 60 * 60;

export type ValidationResult =
  | { valid: true; user?: InitDataUser }
  | { valid: false; reason: string };

/**
 * Проверяет подпись Telegram initData по алгоритму:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 1. Убираем hash из параметров
 * 2. Сортируем оставшиеся по ключу и соединяем через \n
 * 3. secret_key = HMAC-SHA256("WebAppData", botToken)
 * 4. expected   = HMAC-SHA256(data_check_string, secret_key)
 * 5. Сравниваем с hash через timingSafeEqual (защита от timing attacks)
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
): ValidationResult {
  try {
    const params = new URLSearchParams(initData);

    const hash = params.get("hash");
    if (!hash) return { valid: false, reason: "hash отсутствует" };

    const authDate = Number(params.get("auth_date"));
    if (!authDate) return { valid: false, reason: "auth_date отсутствует" };

    const ageSeconds = Date.now() / 1000 - authDate;
    if (ageSeconds > MAX_AGE_SECONDS) {
      return { valid: false, reason: "initData устарела" };
    }

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const hashBuf     = Buffer.from(hash, "hex");
    const expectedBuf = Buffer.from(expectedHash, "hex");

    if (hashBuf.length !== expectedBuf.length) {
      return { valid: false, reason: "неверная длина hash" };
    }

    if (!crypto.timingSafeEqual(hashBuf, expectedBuf)) {
      return { valid: false, reason: "подпись не совпадает" };
    }

    const userStr = params.get("user");
    const user = userStr ? (JSON.parse(userStr) as InitDataUser) : undefined;

    return { valid: true, user };
  } catch (e) {
    return { valid: false, reason: `ошибка парсинга: ${String(e)}` };
  }
}
