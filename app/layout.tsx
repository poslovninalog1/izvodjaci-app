import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import TopHeader from "./components/TopHeader";
import DeactivatedBanner from "./components/DeactivatedBanner";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sr">
      <body>
        <AuthProvider>
          <ToastProvider>
            <div className="shell">
              <TopHeader />
              <main className="content">
                <DeactivatedBanner />
                {children}
              </main>
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
