import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { adminPool } from '../../db/pool.js';
import { ADMIN_TTL_SECONDS, signAdminToken } from '../../lib/admin-token.js';
import { unauthorized } from '../../lib/errors.js';
import { verifyPassword } from '../../lib/password.js';
import { ADMIN_COOKIE, adminAuth, adminLocals } from '../../middleware/admin-auth.js';
import { pgRateLimit } from '../../middleware/pg-rate-limit.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: ADMIN_TTL_SECONDS * 1000,
};

export const adminAuthRouter = Router();

const loginLimiter = pgRateLimit({ scope: 'admin-login', windowMs: 60_000, max: 5 });

adminAuthRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { email, password } = LoginSchema.parse(req.body);
  const { rows } = await adminPool.query<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
  }>(`select id, email, name, password_hash from admins where lower(email) = lower($1)`, [email]);

  const admin = rows[0];
  // Verify against a dummy hash when the account is unknown, so response time
  // does not reveal which emails exist.
  const ok = admin
    ? await verifyPassword(password, admin.password_hash)
    : (await verifyPassword(password, 'scrypt:131072:AAAAAAAAAAAAAAAAAAAAAA==:AAAA'), false);
  if (!ok || !admin) throw unauthorized('bad_credentials', 'Incorrect email or password.');

  await adminPool.query(`update admins set last_login_at = now() where id = $1`, [admin.id]);
  const token = await signAdminToken(env.ADMIN_JWT_SECRET, {
    adminId: admin.id,
    email: admin.email,
  });
  res.cookie(ADMIN_COOKIE, token, cookieOptions);
  res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
});

adminAuthRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.status(204).end();
});

adminAuthRouter.get('/me', adminAuth, (_req: Request, res: Response) => {
  const { adminId, email } = adminLocals(res);
  res.json({ admin: { id: adminId, email } });
});
