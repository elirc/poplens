import { SiteChrome } from "@/components/shell/site-chrome";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteChrome>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-4 py-10">
        {children}
      </div>
    </SiteChrome>
  );
}
