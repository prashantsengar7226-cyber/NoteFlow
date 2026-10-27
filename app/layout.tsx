import type { Metadata, Viewport } from 'next';
import { InstallProvider } from './install-app';
import './globals.css';
import './premium.css';
import './product.css';
import './study-workspace.css';
import './noteflow-design.css';
export const metadata: Metadata = {
  title: 'Noteflow — Video to knowledge',
  description: 'Turn videos, lectures and documents into a personal knowledge library.',
  icons: { icon: '/favicon.svg', apple: '/icons/icon-180.png' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Noteflow', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#4255d4' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InstallProvider>{children}</InstallProvider>
      </body>
    </html>
  );
}
