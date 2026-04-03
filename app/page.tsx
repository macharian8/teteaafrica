import { redirect } from 'next/navigation';

// The next-intl middleware handles locale redirects.
// This fallback ensures bare "/" always resolves to the default locale.
export default function RootPage() {
  redirect('/en');
}
