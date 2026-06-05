import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMPLE 2.5D",
  description: "Turn transparent PNG characters into easy 2.5D rigged characters",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
