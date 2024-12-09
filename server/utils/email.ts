import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';

// Initialize SendGrid configuration
const SENDGRID_CONFIG = {
  apiKey: process.env.SENDGRID_API_KEY,
  fromEmail: process.env.SENDGRID_FROM_EMAIL || 'sandeep@asterial.in'
};

// Configure SendGrid if API key is available
if (SENDGRID_CONFIG.apiKey) {
  sgMail.setApiKey(SENDGRID_CONFIG.apiKey);
} else {
  console.warn('SENDGRID_API_KEY is not set in environment variables');
}

// Validate email configuration
function validateEmailConfig() {
  const errors = [];
  if (!SENDGRID_CONFIG.apiKey) {
    errors.push('SendGrid API key is not configured');
  }
  if (!SENDGRID_CONFIG.fromEmail) {
    errors.push('SendGrid sender email is not configured');
  }
  return errors;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const emailService = {
  generateVerificationToken: () => {
    return randomBytes(32).toString('hex');
  },

  sendVerificationEmail: async (to: string, token: string) => {
    try {
      if (!SENDGRID_CONFIG.apiKey) {
        throw new Error('SendGrid API key is not configured');
      }

      // Use the explicit Repl URL
      const appUrl = 'https://custombedtimestories.celeritas78.repl.co';
      const verificationLink = `${appUrl}/verify-email/${token}`;
      
      const msg: EmailOptions = {
        to,
        subject: 'Verify your email - The Story Bot',
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Welcome!</h2>
            <p>Click the link below to verify your email:</p>
            <p><a href="${verificationLink}">Verify Email</a></p>
            <p>Link expires in 24 hours.</p>
          </div>
        `,
      };

      const result = await sgMail.send({
        ...msg,
        from: SENDGRID_CONFIG.fromEmail,
      });

      return result[0]?.statusCode === 202;
    } catch (error: any) {
      console.error('Failed to send verification email:', error.message);
      return false;
    }
  }
};
