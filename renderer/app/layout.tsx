import type {
  Metadata
} from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "../features/app/AppShell";
import { ErrorToastHost } from "../features/app/ErrorToast";
import { UpdateBanner } from "../features/app/UpdateBanner";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-inter"
});

export const metadata: Metadata = {
  title: "Xàm Xí Xíu",
  description: "Threads content creator workspace"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="vi" className={inter.variable}>
      <body className={inter.className}>
        <AppShell />
        <div hidden>{children}</div>
        <ErrorToastHost />
        <UpdateBanner />
      </body>
    </html>
  );
}
