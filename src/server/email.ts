// Envoi d'e-mails via l'API HTTP de Resend (Railway bloque le SMTP sortant
// sur certaines offres ; une API HTTP fonctionne partout).
// Sans RESEND_API_KEY : le contenu de l'e-mail est écrit dans les logs.

type Email = { to: string; subject: string; html: string; text: string };

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"] ?? "BookCinéDZ <onboarding@resend.dev>";

  if (!apiKey) {
    // Pas encore de service d'e-mail : le message (et son lien) est écrit dans
    // les logs, visibles uniquement par les membres du projet Railway. Pratique
    // pour démarrer ; à remplacer par Resend avant d'ouvrir au public.
    console.info(
      `[email] RESEND_API_KEY absent — e-mail NON envoyé, contenu ci-dessous.\nÀ: ${email.to}\nSujet: ${email.subject}\n${email.text}`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...email }),
  });
  if (!res.ok) {
    console.error(`[email] échec d'envoi à ${email.to}: ${res.status} ${await res.text()}`);
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// Gabarit simple : un titre, un paragraphe, un bouton.
export function actionEmail(opts: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
}): Email {
  const intro = escapeHtml(opts.intro);
  const url = escapeHtml(opts.url);
  return {
    to: opts.to,
    subject: opts.subject,
    text: `${opts.intro}\n\n${opts.action} : ${opts.url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;color:#dc2626">BookCinéDZ</h1>
  <p style="font-size:15px;line-height:1.5">${intro}</p>
  <p style="margin:28px 0"><a href="${url}" style="background:#dc2626;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(opts.action)}</a></p>
  <p style="font-size:12px;color:#64748b">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
</div>`,
  };
}
