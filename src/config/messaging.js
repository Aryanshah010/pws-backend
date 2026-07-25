const NEPAL_DIALLING_CODE = "977";

const value = (key) => (process.env[key] || "").trim();

const toE164 = (phone) => {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+${NEPAL_DIALLING_CODE}${digits}`;
  if (digits.startsWith(NEPAL_DIALLING_CODE)) return `+${digits}`;
  return `+${digits}`;
};

const sms = {
  // Ncell / aggregator HTTP gateway.
  apiUrl: value("NCELL_SMS_API_URL"),
  apiKey: value("NCELL_SMS_API_KEY"),
  senderId: value("NCELL_SMS_SENDER_ID") || "Pathivara",
  authHeader: value("NCELL_SMS_AUTH_HEADER") || "Authorization",
  authScheme: value("NCELL_SMS_AUTH_SCHEME") || "Bearer",
  timeoutMs: Number(value("SMS_TIMEOUT_MS")) || 8000,
};

const whatsapp = {
  // Twilio WhatsApp sandbox.
  accountSid: value("TWILIO_ACCOUNT_SID"),
  authToken: value("TWILIO_AUTH_TOKEN"),
  // Twilio's shared sandbox sender. Override only with an approved sender.
  from: value("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886",

  sandboxNumbers: value("TWILIO_WHATSAPP_SANDBOX_NUMBERS")
    .split(",")
    .map((entry) => toE164(entry))
    .filter(Boolean),
};

const smsConfigured = Boolean(sms.apiUrl && sms.apiKey);
const whatsappConfigured = Boolean(whatsapp.accountSid && whatsapp.authToken);

const isSandboxRecipient = (phone) => {
  const target = toE164(phone);
  return Boolean(target) && whatsapp.sandboxNumbers.includes(target);
};

module.exports = {
  sms,
  whatsapp,
  smsConfigured,
  whatsappConfigured,
  isSandboxRecipient,
  toE164,
};
