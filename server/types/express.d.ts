
import { Request as ExpressRequest } from 'express';

declare global {
  namespace Express {
    interface Request {
      rawBody: Buffer;
      isAuthenticated: () => boolean;
      user?: any;
      logout: (callback: (err?: Error) => void) => void;
      login: (user: any, callback: (err?: Error) => void) => void;
      session: any;
    }
  }
}

export {};
