import { launchErrors } from './launch-config.mjs';

if(process.argv.includes('--local')) {
  const {default:nextEnv}=await import('@next/env');
  nextEnv.loadEnvConfig(process.cwd());
}
const errors=launchErrors(process.env);
if(Number(process.versions.node.split('.')[0])!==24) errors.push('Select Node.js 24.x');
if(errors.length) {
  console.error('Launch configuration check failed:\n'+errors.map(error=>'- '+error).join('\n'));
  process.exitCode=1;
} else {
  console.log('Launch configuration passed offline checks. No credentials displayed.');
  console.log('This does not verify provider availability, Supabase policy, or deployed behavior.');
  if(!process.env.SUPADATA_API_KEY?.trim()) console.log('YouTube import is unavailable until SUPADATA_API_KEY is configured.');
}
