import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/queryProvider";

const sourceSansPro = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "N-SCOPE",
  description: "Neo Supply Chain Optimization & Planning Engine",
  icons: {
    icon: "/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSansPro.variable} h-full antialiased`}
    >
      <body className="min-h-full antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
