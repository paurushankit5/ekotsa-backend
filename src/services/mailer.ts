import nodemailer from "nodemailer";
import { loadEnv } from "../config/env.js";

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ delivered: boolean; mode: "smtp" | "console" }> {
  const env = loadEnv();

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.log(
      `[ekotsa-backend] email → ${input.to}\nSubject: ${input.subject}\n${input.text}`,
    );
    return { delivered: false, mode: "console" };
  }

  const port = env.SMTP_PORT ?? 587;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ?? port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  await transport.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return { delivered: true, mode: "smtp" };
}
