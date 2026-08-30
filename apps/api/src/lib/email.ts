import type { Env } from '../env.js'

/**
 * Envio via API HTTP da Resend. Sem SDK: um `fetch` é tudo que o Worker
 * precisa, e evita carregar dependência que assume APIs de Node.
 */
export async function sendEmail(
  env: Env,
  message: { to: string; subject: string; html: string },
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.MAIL_FROM, ...message }),
  })

  if (!response.ok) {
    // Falha de e-mail não pode derrubar o cadastro em si, mas precisa aparecer
    // no log — senão o usuário fica esperando um link que nunca chegou.
    console.error('Falha ao enviar e-mail:', response.status, await response.text())
    throw new Error('Não foi possível enviar o e-mail')
  }
}

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#0f172a;max-width:480px;margin:0 auto;padding:32px 24px">
<h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
${body}
<p style="color:#64748b;font-size:13px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px">
Se você não pediu isto, pode ignorar este e-mail com segurança.</p>
</body></html>`
}

export function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${label}</a></p>
<p style="color:#64748b;font-size:13px">Ou copie este endereço:<br><span style="word-break:break-all">${href}</span></p>`
}
