import type {
  Metadata
} from "next";
import "./globals.css";
import { ErrorToastHost } from "../features/app/ErrorToast";
import { UpdateBanner } from "../features/app/UpdateBanner";

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
    <html lang="vi">
      <body>
        {children}
        <ErrorToastHost />
        <UpdateBanner />
      </body>
    </html>
  );
}
