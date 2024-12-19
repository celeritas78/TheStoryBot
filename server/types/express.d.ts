import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      isAuthenticated(): boolean;
      user?: User;
      logout(callback: (err?: Error) => void): void;
      login(user: User, callback: (err?: Error) => void): void;
      session: {
        id: string;
        [key: string]: any;
      };
    }

    interface Response extends ExpressResponse {
      locals: {
        [key: string]: any;
      };
    }
  }
}

export interface StripeWebhookRequest extends Express.Request {
  rawBody: Buffer;
}

export interface AuthenticatedRequest extends Express.Request {
  user: User;
}

export { NextFunction };
export {};