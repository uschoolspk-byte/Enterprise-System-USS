var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var brevoEmail_exports = {};
__export(brevoEmail_exports, {
  getEmailConfig: () => getEmailConfig,
  sendTransactionalEmail: () => sendTransactionalEmail,
  verifyEmailConnectivity: () => verifyEmailConnectivity
});
module.exports = __toCommonJS(brevoEmail_exports);
var import_nodemailer = __toESM(require("nodemailer"), 1);
function env(key) {
  const raw = process.env[key];
  if (!raw) return "";
  return raw.replace(/^["']|["']$/g, "").trim();
}
function getEmailConfig() {
  const smtpUser = env("SMTP_USER");
  const smtpPass = env("SMTP_PASS");
  const brevoApiKey = env("BREVO_API_KEY");
  const fromEmail = env("SMTP_FROM_EMAIL") || "uschools.pk@gmail.com";
  const fromName = env("SMTP_FROM_NAME") || "Unique School System";
  const host = env("SMTP_HOST") || "smtp-relay.brevo.com";
  const port = parseInt(env("SMTP_PORT") || "587", 10);
  return {
    fromEmail,
    fromName,
    host,
    port,
    smtpConfigured: Boolean(smtpUser && smtpPass),
    apiConfigured: Boolean(brevoApiKey),
    configured: Boolean(smtpUser && smtpPass || brevoApiKey),
    smtpUser: smtpUser ? `${smtpUser.slice(0, 6)}\u2026` : "",
    hasFromEmail: Boolean(fromEmail && fromEmail.includes("@"))
  };
}
function createSmtpTransporter() {
  const cfg = getEmailConfig();
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  if (!user || !pass) return null;
  return import_nodemailer.default.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port === 587,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" }
  });
}
function isDeliverableAddress(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  if (e.includes("example.com")) return false;
  return true;
}
async function sendViaBrevoApi(options) {
  const apiKey = env("BREVO_API_KEY");
  if (!apiKey) {
    return { status: "Failed", error: "BREVO_API_KEY not configured" };
  }
  const body = {
    sender: { name: options.fromName, email: options.fromEmail },
    to: [{ email: options.to }],
    subject: options.subject,
    htmlContent: options.html,
    textContent: options.text || void 0
  };
  if (options.attachments?.length) {
    body.attachment = options.attachments.map((att) => ({
      name: att.filename,
      content: att.encoding === "base64" ? att.content : Buffer.from(att.content).toString("base64")
    }));
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    return { status: "Success", channel: "brevo-api" };
  }
  let detail = `HTTP ${res.status}`;
  try {
    const json = await res.json();
    detail = json?.message || json?.code || detail;
  } catch {
    detail = `${detail}: ${(await res.text()).slice(0, 200)}`;
  }
  return { status: "Failed", channel: "brevo-api", error: detail };
}
async function sendViaSmtp(options) {
  const transporter = createSmtpTransporter();
  if (!transporter) {
    return { status: "Failed", error: "SMTP_USER/SMTP_PASS not configured" };
  }
  try {
    await transporter.sendMail({
      from: `"${options.fromName}" <${options.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        encoding: att.encoding || "base64"
      }))
    });
    return { status: "Success", channel: "smtp" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "Failed", channel: "smtp", error: message };
  }
}
async function sendTransactionalEmail(options) {
  const cfg = getEmailConfig();
  if (!isDeliverableAddress(options.to)) {
    return {
      status: "Simulated",
      error: `Non-deliverable or test address: ${options.to}`
    };
  }
  if (!cfg.configured) {
    return {
      status: "Simulated",
      error: "Email not configured \u2014 set BREVO_API_KEY and/or SMTP_USER+SMTP_PASS on Render"
    };
  }
  if (cfg.apiConfigured) {
    const apiResult = await sendViaBrevoApi({
      ...options,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName
    });
    if (apiResult.status === "Success") return apiResult;
    console.warn("[Email] Brevo API failed, trying SMTP fallback:", apiResult.error);
  }
  if (cfg.smtpConfigured) {
    const smtpResult = await sendViaSmtp({
      ...options,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName
    });
    if (smtpResult.status === "Success") return smtpResult;
    console.error("[Email] SMTP failed:", smtpResult.error);
    return smtpResult;
  }
  return {
    status: "Failed",
    error: cfg.apiConfigured ? "Brevo API and SMTP both failed" : "No SMTP credentials after API failure"
  };
}
async function verifyEmailConnectivity() {
  const config = getEmailConfig();
  if (!config.configured) {
    return {
      ok: false,
      config,
      hint: "Set BREVO_API_KEY (recommended on Render) and SMTP_FROM_EMAIL in Render Environment variables."
    };
  }
  let smtpVerify;
  if (config.smtpConfigured) {
    try {
      const t = createSmtpTransporter();
      await t?.verify();
      smtpVerify = "ok";
    } catch (err) {
      smtpVerify = err instanceof Error ? err.message : String(err);
    }
  }
  let apiReachable;
  if (config.apiConfigured) {
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": env("BREVO_API_KEY"), Accept: "application/json" }
      });
      apiReachable = res.ok;
    } catch {
      apiReachable = false;
    }
  }
  const ok = Boolean(apiReachable || smtpVerify === "ok");
  return {
    ok,
    config,
    smtpVerify,
    apiReachable,
    hint: ok ? void 0 : "Verify BREVO_API_KEY and that SMTP_FROM_EMAIL is a verified sender in Brevo dashboard."
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getEmailConfig,
  sendTransactionalEmail,
  verifyEmailConnectivity
});
