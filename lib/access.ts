import { env } from './platform';
import { AppError } from './core';

export type Role = 'user' | 'admin' | 'superuser';
export type Access = { role: Role; suspended: boolean; revision: string | null };
export const elevated = (role: Role) => role === 'admin' || role === 'superuser';
export async function accessFor(owner: string): Promise<Access> {
  const row = await env.DB.prepare('SELECT role,suspended,revision FROM user_access WHERE owner=?').bind(owner).first<{role:Role;suspended:number;revision:string}>();
  return row ? {role:row.role,suspended:!!row.suspended,revision:row.revision} : {role:'user',suspended:false,revision:null};
}
export async function activeAccess(owner: string) {
  const access = await accessFor(owner);
  if(access.suspended) throw new AppError(403,'ACCOUNT_SUSPENDED','This account is suspended. Contact the site owner.');
  return access;
}
export async function requireAdmin(owner: string, superuser = false) {
  const access = await activeAccess(owner);
  if(superuser ? access.role !== 'superuser' : !elevated(access.role))
    throw new AppError(403,'ADMIN_REQUIRED',superuser ? 'Only a superuser can manage account access.' : 'Administrator access is required.');
  return access;
}
export async function rememberUser(user: {userId:string;email:string;displayName?:string}) {
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO user_directory(owner,email,display_name,first_seen,last_seen) VALUES(?,?,?,?,?)
    ON CONFLICT(owner) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,last_seen=excluded.last_seen
    WHERE user_directory.last_seen<? OR user_directory.email!=excluded.email`)
    .bind(user.userId,user.email.slice(0,320),(user.displayName||user.email).slice(0,160),now,now,now-300000).run();
}
