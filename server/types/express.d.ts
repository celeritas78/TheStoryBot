
import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
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

export interface AuthenticatedRequest extends ExpressRequest {
  user: User;
}

export { NextFunction };
export {};
