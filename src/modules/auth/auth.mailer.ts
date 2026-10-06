import nodemailer from "nodemailer";
import { loadEnv } from "../../config/env.js";

export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: "PASSWORD_RESET" | "LOGIN" | "DEVICE_ACTIVATION" = "PASSWORD_RESET",
) {
  const env = loadEnv();
  const label =
    purpose === "LOGIN"
      ? "login"
      : purpose === "DEVICE_ACTIVATION"
        ? "device activation"
        : "password reset";
  const subject =
    purpose === "PASSWORD_RESET" ? "Your Ekotsa password reset code" : "Your Ekotsa OTP code";
  const text = `Your ${label} code is ${otp}. It expires in 10 minutes.`;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.log(`[ekotsa-backend] OTP for ${to}: ${otp} (SMTP not configured)`);
    return { delivered: false as const, mode: "console" as const };
  }

  const port = env.SMTP_PORT ?? 587;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ?? port === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  await transport.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to,
    subject,
    text,
  });

  return { delivered: true as const, mode: "smtp" as const };
}
