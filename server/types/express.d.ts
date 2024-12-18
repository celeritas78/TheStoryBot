
import { Request as ExpressRequest } from 'express';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      isAuthenticated?: () => boolean;
      user?: any;
    }
  }
}

export {};
