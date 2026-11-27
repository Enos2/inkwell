// Project: Inkwell
// Location: backend/services/email.service.ts
// Purpose: Sends emails through Resend (resend.com). It never throws: if an
// email cannot be sent, the problem is only logged, so a mail problem can never
// break signing up or any other action. With no RESEND_API_KEY it prints the
// email in the terminal while developing (so you can copy the link from it),
// and in production it only logs a warning (links are never written to logs
// there). Note: until you verify your own sending domain at Resend, the test
// sender can only deliver to the email address of your own Resend account.

import { env } from "../config/env";

type Email = { to: string; subject: string; text: string };

export async function sendEmail(email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV !== "production") {
      console.log(
        `\n--- EMAIL (not sent, no RESEND_API_KEY) ---\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n--- end of email ---\n`
      );
    } else {
      console.warn("An email was not sent because RESEND_API_KEY is not set");
    }
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error("The email service refused a message", response.status);
    }
  } catch (error) {
    console.error("Could not send an email", error);
  }
}

// Location: backend/services/email.service.ts
// End of file: email.service.ts