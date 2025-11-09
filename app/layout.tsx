import type { Metadata } from 'next';
import './globals.css';
import SwRegister from './SwRegister';

export const metadata: Metadata = {
  title: 'Smart Daily To-Do with Alarms',
  description: 'Plan your day and get timely reminders',
  manifest: '/manifest.json'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
