import type { Env } from "../types";

interface SmtpEmailInput {
  to: string;
  subject: string;
  html: string;
}

function encodeBase64(value: string) {
  return btoa(value);
}

async function readResponse(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\r\n")) break;
  }

  return buffer.trim();
}

async function writeLine(writer: WritableStreamDefaultWriter<Uint8Array>, line: string) {
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`${line}\r\n`));
}

async function expectCode(response: string, code: string) {
  if (!response.startsWith(code)) {
    throw new Error(`SMTP error: ${response}`);
  }
}

export async function sendViaBrevoSmtp(env: Env, input: SmtpEmailInput) {
  const login = env.BREVO_SMTP_LOGIN;
  const password = env.BREVO_SMTP_KEY || env.BREVO_API_KEY;
  const fromEmail = env.BREVO_SENDER_EMAIL;
  const fromName = env.BREVO_SENDER_NAME || "Webhook Master";

  if (!login || !password || !fromEmail) {
    throw new Error("Brevo SMTP not configured");
  }

  const { connect } = await import("cloudflare:sockets");
  const socket = connect({ hostname: "smtp-relay.brevo.com", port: 587 });
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();

  try {
    const greeting = await readResponse(reader);
    await expectCode(greeting, "220");

    await writeLine(writer, "EHLO webhook-delivery");
    let ehlo = await readResponse(reader);
    while (ehlo.startsWith("250-")) {
      ehlo = await readResponse(reader);
    }
    await expectCode(ehlo, "250");

    await writeLine(writer, "STARTTLS");
    const startTls = await readResponse(reader);
    await expectCode(startTls, "220");

    await socket.startTls();
    const tlsReader = socket.readable.getReader();
    const tlsWriter = socket.writable.getWriter();

    await writeLine(tlsWriter, "EHLO webhook-delivery");
    let ehloTls = await readResponse(tlsReader);
    while (ehloTls.startsWith("250-")) {
      ehloTls = await readResponse(tlsReader);
    }
    await expectCode(ehloTls, "250");

    await writeLine(tlsWriter, "AUTH LOGIN");
    const authPrompt = await readResponse(tlsReader);
    await expectCode(authPrompt, "334");

    await writeLine(tlsWriter, encodeBase64(login));
    const userPrompt = await readResponse(tlsReader);
    await expectCode(userPrompt, "334");

    await writeLine(tlsWriter, encodeBase64(password));
    const authResult = await readResponse(tlsReader);
    await expectCode(authResult, "235");

    await writeLine(tlsWriter, `MAIL FROM:<${fromEmail}>`);
    const mailFrom = await readResponse(tlsReader);
    await expectCode(mailFrom, "250");

    await writeLine(tlsWriter, `RCPT TO:<${input.to}>`);
    const rcptTo = await readResponse(tlsReader);
    await expectCode(rcptTo, "250");

    await writeLine(tlsWriter, "DATA");
    const dataPrompt = await readResponse(tlsReader);
    await expectCode(dataPrompt, "354");

    const message = [
      `From: ${fromName} <${fromEmail}>`,
      `To: <${input.to}>`,
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      input.html,
      ".",
    ].join("\r\n");

    const encoder = new TextEncoder();
    await tlsWriter.write(encoder.encode(`${message}\r\n`));

    const dataResult = await readResponse(tlsReader);
    await expectCode(dataResult, "250");

    await writeLine(tlsWriter, "QUIT");
    await readResponse(tlsReader);
  } finally {
    try {
      await writer.close();
    } catch {
      /* ignore */
    }
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }
}
