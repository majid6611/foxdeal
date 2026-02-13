import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

declare global {
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
    }
  }
}

/**
 * Validate Telegram Mini App initData.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData: string, botToken: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  // Remove hash from params and sort alphabetically
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Compute HMAC
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) return null;

  // Parse user from initData
  const userStr = params.get('user');
  if (!userStr) return null;

  try {
    return JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
}

/**
 * Express middleware to authenticate Telegram Mini App requests.
 * Expects `Authorization: tma <initData>` header.
 */
export function telegramAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('tma ')) {
    res.status(401).json({ error: 'Missing Telegram Mini App authorization' });
    return;
  }

  const initData = authHeader.slice(4);
  const user = validateInitData(initData, env.BOT_TOKEN);

  if (!user) {
    res.status(401).json({ error: 'Invalid Telegram Mini App authorization' });
    return;
  }

  req.telegramUser = user;
  next();
}
