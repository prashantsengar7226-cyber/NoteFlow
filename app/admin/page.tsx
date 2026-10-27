import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getChatGPTUser } from '../chatgpt-auth';
import { activeAccess, elevated } from '@/lib/access';
import AdminDashboard from './dashboard';
import './admin.css';
export const dynamic='force-dynamic';
export default async function Administration() {
  const user=await getChatGPTUser();
  if(!user)redirect('/login');
  const access=await activeAccess(user.userId).catch(()=>null);
  if(!access||!elevated(access.role))return <main className="admin-denied"><h1>Administrator access required</h1><p>This account does not have access to site administration.</p><Link href="/">Return to your workspace</Link></main>;
  return <AdminDashboard role={access.role} owner={user.userId}/>;
}
