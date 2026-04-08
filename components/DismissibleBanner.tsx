'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings, X } from 'lucide-react';

interface Props {
  message: string;
  linkText: string;
  linkHref: string;
}

export default function DismissibleBanner({ message, linkText, linkHref }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
      <Settings className="w-4 h-4 text-blue-500 shrink-0" />
      <p className="text-sm text-blue-700 flex-1">{message}</p>
      <Link
        href={linkHref}
        className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap"
      >
        {linkText}
      </Link>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 text-blue-400 hover:text-blue-600 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
