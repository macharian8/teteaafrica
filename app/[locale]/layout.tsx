import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import Navbar from '@/components/Navbar';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'app' });
  return {
    title: { template: `%s — ${t('name')}`, default: t('name') },
    description: t('description'),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  if (!routing.locales.includes(locale as 'en' | 'sw')) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className={cn('font-sans', inter.variable)}>
      <body className="antialiased bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <Navbar />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
