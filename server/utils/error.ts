import { Response } from 'express';

export function sendErrorResponse(res: Response, statusCode: number, error: string, details?: any) {
  res.status(statusCode).json({
    error,
    details,
    timestamp: new Date().toISOString()
  });
}
