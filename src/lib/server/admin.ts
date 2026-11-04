import type { Cookies } from '@sveltejs/kit';
import { verifyAdmin } from './auth.ts';
import { config } from './config.ts';

export const ADMIN_COOKIE = 'admin';

/** The admin pages are off until both a password and a long secret are set. */
export const adminEnabled = () => config.adminPassword.length > 0 && config.adminSecret.length >= 32;

export const isAdmin = (cookies: Cookies) => adminEnabled() && verifyAdmin(config.adminSecret, cookies.get(ADMIN_COOKIE));
