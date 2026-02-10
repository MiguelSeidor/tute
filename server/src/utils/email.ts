import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  ...(process.env.SMTP_USER && process.env.SMTP_PASS
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
    : {}),
});

export async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = process.env.SMTP_FROM || 'Tute Parrillano <noreply@tutevalenciano.com>';

  await transporter.sendMail({
    from,
    to,
    subject: 'Recuperar contraseña - Tute Parrillano',
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2e7d32;">Tute Parrillano</h2>
        <p>Has solicitado restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 24px; background: #2e7d32; color: #fff;
                    text-decoration: none; border-radius: 8px; font-weight: 600;">
            Restablecer contraseña
          </a>
        </p>
        <p style="font-size: 0.85rem; color: #666;">
          Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email.
        </p>
      </div>
    `,
  });
}
