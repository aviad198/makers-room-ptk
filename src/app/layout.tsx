import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'MakersRoom PTK · 3D printer queue',
  description:
    'Book slots on the workshop 3D printers. Fair scheduling, overnight long prints, and priority for urgent work jobs.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-dvh bg-slate-50 font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
