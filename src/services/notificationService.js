const {
  sms: smsConfig,
  whatsapp: whatsappConfig,
  smsConfigured,
  whatsappConfigured,
  isSandboxRecipient,
  toE164,
} = require("../config/messaging");

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  white: "\x1b[37m",
};

const formatPhone = (phone) => {
  if (!phone) return "N/A";
  const clean = String(phone).replace(/\D/g, "");
  if (clean.length === 10) {
    return `+977-${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return phone;
};

const simulate = ({ gateway, badgeColor, bodyColor, to, meta, message }) => {
  console.log(`
┌────────────────────────────────────────────────────────────┐
│ ${badgeColor}${colors.white}${colors.bright}  [${gateway}]  ${colors.reset}
├────────────────────────────────────────────────────────────┤
│ ${colors.bright}To:${colors.reset} ${to}
│ ${colors.bright}${meta.label}:${colors.reset} ${meta.value}
│ ${colors.bright}Mode:${colors.reset} ${colors.yellow}SIMULATED${colors.reset} (no provider credentials in .env)
├────────────────────────────────────────────────────────────┤
│ "${bodyColor}${message}${colors.reset}"
└────────────────────────────────────────────────────────────┘
  `);
};

const logDelivery = (channel, to, status, detail) => {
  const tone = status === "sent" ? colors.green : colors.red;
  console.log(
    `${tone}[${channel}]${colors.reset} ${to} → ${status}${detail ? ` (${detail})` : ""}`,
  );
};


exports.sendSMS = async (toPhone, message, context = "") => {
  const to = toE164(toPhone);
  if (!to) {
    return { channel: "sms", to: "", status: "skipped", detail: "no phone" };
  }

  if (!smsConfigured) {
    simulate({
      gateway: "NCELL SMS GATEWAY",
      badgeColor: colors.bgBlue,
      bodyColor: colors.cyan,
      to: formatPhone(toPhone),
      meta: { label: "Carrier", value: "Ncell Nepal" },
      message,
    });
    return { channel: "sms", to, status: "simulated", context };
  }

  try {
    const response = await fetch(smsConfig.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [smsConfig.authHeader]: smsConfig.authScheme
          ? `${smsConfig.authScheme} ${smsConfig.apiKey}`
          : smsConfig.apiKey,
      },
      body: JSON.stringify({
        from: smsConfig.senderId,
        to,
        text: message,
      }),
      signal: AbortSignal.timeout(smsConfig.timeoutMs),
    });

    const raw = await response.text();
    if (!response.ok) {
      logDelivery("NCELL SMS", to, "failed", `HTTP ${response.status}`);
      return {
        channel: "sms",
        to,
        status: "failed",
        detail: `HTTP ${response.status}: ${raw.slice(0, 200)}`,
        context,
      };
    }

    logDelivery("NCELL SMS", to, "sent");
    return {
      channel: "sms",
      to,
      status: "sent",
      detail: raw.slice(0, 200),
      context,
    };
  } catch (error) {
    logDelivery("NCELL SMS", to, "failed", error.message);
    return {
      channel: "sms",
      to,
      status: "failed",
      detail: error.message,
      context,
    };
  }
};

let twilioClient;
const getTwilioClient = () => {
  if (!twilioClient) {
    twilioClient = require("twilio")(
      whatsappConfig.accountSid,
      whatsappConfig.authToken,
    );
  }
  return twilioClient;
};

exports.sendWhatsApp = async (toPhone, message, context = "") => {
  const to = toE164(toPhone);
  if (!to) {
    return {
      channel: "whatsapp",
      to: "",
      status: "skipped",
      detail: "no phone",
    };
  }

  const enrolled = isSandboxRecipient(to);

  if (!whatsappConfigured || !enrolled) {
    simulate({
      gateway: "TWILIO WHATSAPP SANDBOX",
      badgeColor: colors.bgGreen,
      bodyColor: colors.green,
      to: `whatsapp:${formatPhone(toPhone)}`,
      meta: {
        label: "Sandbox",
        value: whatsappConfigured
          ? "number has not joined the sandbox"
          : "credentials not configured",
      },
      message,
    });
    return {
      channel: "whatsapp",
      to,
      status: "simulated",
      detail: whatsappConfigured ? "not enrolled in sandbox" : "not configured",
      context,
    };
  }

  try {
    const result = await getTwilioClient().messages.create({
      from: whatsappConfig.from,
      to: `whatsapp:${to}`,
      body: message,
    });
    logDelivery("TWILIO WHATSAPP", to, "sent", result.sid);
    return {
      channel: "whatsapp",
      to,
      status: "sent",
      detail: result.sid,
      context,
    };
  } catch (error) {
    logDelivery("TWILIO WHATSAPP", to, "failed", error.message);
    return {
      channel: "whatsapp",
      to,
      status: "failed",
      detail: error.message,
      context,
    };
  }
};


exports.notify = async (phone, { sms, whatsapp } = {}, context = "") => {
  const attempts = [];
  if (sms) attempts.push(exports.sendSMS(phone, sms, context));
  if (whatsapp) attempts.push(exports.sendWhatsApp(phone, whatsapp, context));
  return Promise.all(attempts);
};

exports.channelStatus = () => ({
  sms: smsConfigured ? "live (Ncell)" : "simulated",
  whatsapp: whatsappConfigured
    ? `live (Twilio sandbox, ${whatsappConfig.sandboxNumbers.length} enrolled number(s))`
    : "simulated",
});
