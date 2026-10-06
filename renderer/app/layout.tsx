import type {
  Metadata
} from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
