import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tetea Africa',
  description: 'Civic intelligence platform for Africa',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
