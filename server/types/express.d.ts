import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { User } from '../db/schema';

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

export { NextFunction };
export {};
