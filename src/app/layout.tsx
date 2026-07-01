import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSansPro = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neochair PO-Shipment Engine",
  description: "Neochair PO-Shipment Engine",
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
        {children}
      </body>
    </html>
  );
}
