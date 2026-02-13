import "./globals.css";
import SidebarTabs from "./components/SidebarTabs";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sr">
      <body>
        <div className="shell">
          <SidebarTabs />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
