import { requireChatGPTUser } from './chatgpt-auth';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <Workspace name={user.fullName?.split(' ')[0] || 'there'} />;
}
