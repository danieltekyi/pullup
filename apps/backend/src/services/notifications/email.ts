import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import fs from 'fs'
import path from 'path'

let cachedTransport: nodemailer.Transporter | null = null

function getTransport(): nodemailer.Transporter | null {
  if (cachedTransport) return cachedTransport
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) return null
  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  return cachedTransport
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
}

export async function sendEmail(opts: EmailOptions): Promise<{ ok: boolean; messageId?: string; skipped?: boolean }> {
  const transport = getTransport()
  if (!transport) {
    logger.warn('SMTP not configured — email skipped')
    return { ok: false, skipped: true }
  }
  const info = await transport.sendMail({
    from: opts.from || env.FROM_EMAIL || `no-reply@pullup.app`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  })
  return { ok: true, messageId: info.messageId }
}

export function renderTemplate(name: string, vars: Record<string, string>): string {
  const tplPath = path.join(process.cwd(), 'templates', `${name}.html`)
  let html = fs.readFileSync(tplPath, 'utf8')
  for (const [k, v] of Object.entries(vars)) {
    html = html.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v)
  }
  return html
}
