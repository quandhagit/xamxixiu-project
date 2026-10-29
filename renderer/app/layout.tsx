import type {
  Metadata
} from "next";
import "./globals.css";
import { ErrorToastHost } from "../features/app/ErrorToast";

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
      </body>
    </html>
  );
}
