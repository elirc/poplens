import { SiteChrome } from "@/components/shell/site-chrome";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteChrome>{children}</SiteChrome>;
}
