import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yori — A place to keep the conversation going",
  description: "A quieter home for the community, beyond the chat.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
