import type { Request, Response, NextFunction } from 'express';
import { auth } from './firebase.js';

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function verifyFirebaseToken(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }
  const idToken = header.slice('Bearer '.length).trim();
  try {
    const decoded = await auth().verifyIdToken(idToken);
    req.userId = decoded.uid;
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid_token', detail: (err as Error).message });
  }
}
