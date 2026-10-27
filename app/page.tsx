import { getChatGPTUser } from './chatgpt-auth';
import PublicSite from './public-site';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <PublicSite/>;
  return <Workspace name={user.fullName?.split(' ')[0] || 'there'} />;
}
