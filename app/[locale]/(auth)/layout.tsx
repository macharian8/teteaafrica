export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
