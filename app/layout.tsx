import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import TopHeader from "./components/TopHeader";
import DeactivatedBanner from "./components/DeactivatedBanner";
import RouteModeBanner from "./components/RouteModeBanner";
import AccountTypeModal from "./components/AccountTypeModal";

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
              <RouteModeBanner />
              <AccountTypeModal />
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
