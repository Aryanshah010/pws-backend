/**
 * Mock Notification Service (Ncell SMS & Twilio WhatsApp Sandbox simulator)
 * Outputs beautifully formatted messages directly to the server terminal console.
 */

// Simple ANSI colors for terminal logging
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  white: "\x1b[37m",
};

const formatPhone = (phone) => {
  if (!phone) return "N/A";
  let clean = phone.replace(/\D/g, "");
  if (clean.length === 10) {
    return `+977-${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return phone;
};

exports.sendSMS = async (toPhone, message) => {
  const formattedTo = formatPhone(toPhone);

  console.log(`
┌────────────────────────────────────────────────────────────┐
│ ${colors.bgBlue}${colors.white}${colors.bright}  [NCELL SMS GATEWAY]  ${colors.reset}                                      │
├────────────────────────────────────────────────────────────┤
│ ${colors.bright}To:${colors.reset} ${formattedTo}                                            │
│ ${colors.bright}Carrier:${colors.reset} Ncell Nepal                                       │
├────────────────────────────────────────────────────────────┤
│ "${colors.cyan}${message}${colors.reset}"
└────────────────────────────────────────────────────────────┘
  `);
  return true;
};

exports.sendWhatsApp = async (toPhone, message) => {
  const formattedTo = formatPhone(toPhone);

  console.log(`
┌────────────────────────────────────────────────────────────┐
│ ${colors.bgGreen}${colors.white}${colors.bright}  [TWILIO WHATSAPP SANDBOX]  ${colors.reset}                               │
├────────────────────────────────────────────────────────────┤
│ ${colors.bright}To:${colors.reset} whatsapp:${formattedTo}                                   │
│ ${colors.bright}Sandbox:${colors.reset} active                                            │
├────────────────────────────────────────────────────────────┤
│ "${colors.green}${message}${colors.reset}"
└────────────────────────────────────────────────────────────┘
  `);
  return true;
};
