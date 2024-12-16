import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';

// Initialize SendGrid configuration
const SENDGRID_CONFIG = {
  apiKey: process.env.SENDGRID_API_KEY,
  fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@storybot.app'
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
      // Get the current Repl URL from environment or use a default
      const appUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'http://localhost:3000';
      const verificationLink = `${appUrl}/verify-email/${token}`;

      // Always log verification details in development
      console.log('\n=== Email Verification Details ===');
      console.log('Recipient:', to);
      console.log('Verification Link:', verificationLink);
      console.log('SendGrid Status:', SENDGRID_CONFIG.apiKey ? 'Configured' : 'Not Configured');
      console.log('============================\n');
      
      // Validate SendGrid configuration
      const configErrors = validateEmailConfig();
      if (configErrors.length > 0) {
        console.warn('SendGrid Configuration Issues:');
        configErrors.forEach(error => console.warn(`- ${error}`));
        console.log('Using development fallback - verification link logged above\n');
        return true; // Allow development testing without SendGrid
      }
      
      const msg: EmailOptions = {
        to,
        subject: 'Welcome to Story Bot - Verify Your Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1; margin-bottom: 20px;">Welcome to Story Bot!</h2>
            <p>Thank you for joining Story Bot! To start creating amazing stories, please verify your email address.</p>
            <div style="margin: 30px 0;">
              <a href="${verificationLink}" 
                 style="background-color: #6366f1; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              This verification link will expire in 24 hours. If you didn't create an account with Story Bot, 
              you can safely ignore this email.
            </p>
            <p style="color: #666; font-size: 14px;">
              Or copy and paste this link into your browser:<br>
              <span style="color: #6366f1;">${verificationLink}</span>
            </p>
          </div>
        `,
      };

      const result = await sgMail.send({
        ...msg,
        from: {
          email: SENDGRID_CONFIG.fromEmail,
          name: 'Story Bot'
        },
      });

      console.log('SendGrid Response:', {
        statusCode: result[0]?.statusCode,
        timestamp: new Date().toISOString()
      });

      return result[0]?.statusCode === 202;
    } catch (error: any) {
      console.error('SendGrid Error:', {
        message: error.message,
        code: error.code,
        response: error.response?.body,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }
};
