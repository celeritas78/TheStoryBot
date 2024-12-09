import sgMail from '@sendgrid/mail';
import { randomBytes } from 'crypto';

// Initialize SendGrid with API key
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error('SENDGRID_API_KEY is not set in environment variables');
} else {
  sgMail.setApiKey(apiKey);
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
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SendGrid API key is not configured');
    }

    if (!process.env.SENDGRID_FROM_EMAIL) {
      throw new Error('SendGrid sender email is not configured');
    }

    const verificationLink = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;
    
    const msg: EmailOptions = {
      to,
      subject: 'Verify your email address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Story Generator!</h2>
          <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
          <p>
            <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </p>
          <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p>${verificationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        </div>
      `,
    };

    try {
      // Log the attempt to help with debugging
      console.log('Attempting to send verification email to:', to);
      
      const result = await sgMail.send({
        ...msg,
        from: process.env.SENDGRID_FROM_EMAIL,
      });
      
      if (result[0]?.statusCode === 202) {
        console.log('Successfully sent verification email to:', to);
        return true;
      }
      
      console.error('SendGrid responded with non-202 status:', result[0]?.statusCode);
      throw new Error(`Unexpected response from SendGrid: ${result[0]?.statusCode}`);
    } catch (error: any) {
      // Check for specific SendGrid error cases
      if (error.response?.body?.errors) {
        const errors = error.response.body.errors;
        console.error('SendGrid API errors:', errors);
        
        // Check for common error cases
        if (errors.some((e: any) => e.message?.includes('sender identity'))) {
          throw new Error('Email sending failed: Sender email not verified in SendGrid');
        }
        if (errors.some((e: any) => e.message?.includes('authorization'))) {
          throw new Error('Email sending failed: Invalid SendGrid API key');
        }
        
        // Generic error case
        throw new Error(`SendGrid API error: ${errors[0]?.message || 'Unknown error'}`);
      }
      
      console.error('Error sending verification email:', error.message);
      throw new Error('Failed to send verification email. Please try again later.');
    }
  }
};
