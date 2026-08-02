import type { Env } from "../types";
import { sendViaBrevoSmtp } from "./email-brevo-smtp";

interface SendOtpEmailInput {
  to: string;
  otp: string;
  projectName: string;
}

interface SendPasswordResetOtpInput {
  to: string;
  otp: string;
}

export type SendOtpResult = {
  delivered: boolean;
  provider?: "resend" | "brevo";
  fallback_otp?: string;
  message: string;
};

async function sendViaResend(env: Env, input: SendOtpEmailInput, from: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: `Your verification code for ${input.projectName}`,
      html: buildOtpHtml(input),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

async function sendViaBrevoApi(env: Env, input: SendOtpEmailInput) {
  const senderEmail = env.BREVO_SENDER_EMAIL;
  if (!env.BREVO_API_KEY || !senderEmail) {
    throw new Error("Brevo API not configured");
  }

  const senderName = env.BREVO_SENDER_NAME || "Webhook Master";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: input.to }],
      subject: `Your verification code for ${input.projectName}`,
      htmlContent: buildOtpHtml(input),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

function buildOtpHtml(input: SendOtpEmailInput) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px;">Verify your email</h2>
      <p style="color: #555; line-height: 1.5;">
        Use this code to accept your invitation to <strong>${input.projectName}</strong> on Webhook Delivery.
      </p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.2em; margin: 24px 0;">${input.otp}</p>
      <p style="color: #888; font-size: 14px;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

function isBrevoApiKey(key?: string) {
  return !!key && key.startsWith("xkeysib-");
}

function buildPasswordResetOtpHtml(input: SendPasswordResetOtpInput) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px;">Reset your password</h2>
      <p style="color: #555; line-height: 1.5;">
        Use this code to reset your Webhook Delivery account password.
      </p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.2em; margin: 24px 0;">${input.otp}</p>
      <p style="color: #888; font-size: 14px;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

async function sendPasswordResetViaBrevoApi(env: Env, input: SendPasswordResetOtpInput) {
  const senderEmail = env.BREVO_SENDER_EMAIL;
  if (!env.BREVO_API_KEY || !senderEmail) {
    throw new Error("Brevo API not configured");
  }

  const senderName = env.BREVO_SENDER_NAME || "Webhook Delivery";
  const html = buildPasswordResetOtpHtml(input);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: input.to }],
      subject: "Your password reset code",
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

async function sendPasswordResetViaResend(env: Env, input: SendPasswordResetOtpInput, from: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: "Your password reset code",
      html: buildPasswordResetOtpHtml(input),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function sendPasswordResetOtpEmail(
  env: Env,
  input: SendPasswordResetOtpInput
): Promise<SendOtpResult> {
  const html = buildPasswordResetOtpHtml(input);
  const subject = "Your password reset code";

  if (isBrevoApiKey(env.BREVO_API_KEY) && env.BREVO_SENDER_EMAIL) {
    try {
      await sendPasswordResetViaBrevoApi(env, input);
      return { delivered: true, provider: "brevo", message: "Password reset code sent to your email" };
    } catch (error) {
      console.error("Brevo API failed:", error instanceof Error ? error.message : error);
    }
  }

  if (env.BREVO_SMTP_LOGIN && env.BREVO_SENDER_EMAIL && (env.BREVO_SMTP_KEY || env.BREVO_API_KEY)) {
    try {
      await sendViaBrevoSmtp(env, { to: input.to, subject, html });
      return { delivered: true, provider: "brevo", message: "Password reset code sent to your email" };
    } catch (error) {
      console.error("Brevo SMTP failed:", error instanceof Error ? error.message : error);
    }
  }

  const from = env.EMAIL_FROM || "Webhook Delivery <onboarding@resend.dev>";
  if (env.RESEND_API_KEY) {
    try {
      await sendPasswordResetViaResend(env, input, from);
      return { delivered: true, provider: "resend", message: "Password reset code sent to your email" };
    } catch (error) {
      console.error("Resend failed:", error instanceof Error ? error.message : error);
    }
  }

  if (!env.RESEND_API_KEY && !env.BREVO_API_KEY && !env.BREVO_SMTP_KEY) {
    console.log(`[DEV] Password reset OTP for ${input.to}: ${input.otp}`);
  }

  return {
    delivered: false,
    fallback_otp: input.otp,
    message: "Email could not be delivered. Use the code shown below.",
  };
}

export async function sendInviteOtpEmail(env: Env, input: SendOtpEmailInput): Promise<SendOtpResult> {
  const html = buildOtpHtml(input);
  const subject = `Your verification code for ${input.projectName}`;

  if (isBrevoApiKey(env.BREVO_API_KEY) && env.BREVO_SENDER_EMAIL) {
    try {
      await sendViaBrevoApi(env, input);
      return { delivered: true, provider: "brevo", message: "Verification code sent to your email" };
    } catch (error) {
      console.error("Brevo API failed:", error instanceof Error ? error.message : error);
    }
  }

  if (env.BREVO_SMTP_LOGIN && env.BREVO_SENDER_EMAIL && (env.BREVO_SMTP_KEY || env.BREVO_API_KEY)) {
    try {
      await sendViaBrevoSmtp(env, { to: input.to, subject, html });
      return { delivered: true, provider: "brevo", message: "Verification code sent to your email" };
    } catch (error) {
      console.error("Brevo SMTP failed:", error instanceof Error ? error.message : error);
    }
  }

  const from = env.EMAIL_FROM || "Webhook Delivery <onboarding@resend.dev>";
  if (env.RESEND_API_KEY) {
    try {
      await sendViaResend(env, input, from);
      return { delivered: true, provider: "resend", message: "Verification code sent to your email" };
    } catch (error) {
      console.error("Resend failed:", error instanceof Error ? error.message : error);
    }
  }

  if (!env.RESEND_API_KEY && !env.BREVO_API_KEY && !env.BREVO_SMTP_KEY) {
    console.log(`[DEV] Invite OTP for ${input.to}: ${input.otp}`);
  }

  return {
    delivered: false,
    fallback_otp: input.otp,
    message: "Email could not be delivered. Use the code shown below.",
  };
}
