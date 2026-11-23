// Location: src/app/layout.tsx
// Purpose: The root layout. It wraps every page on the Inkwell website. It sets
// the page title and description shown in the browser tab, loads the global
// styles, and uses the computer's normal fonts (no Google font download).

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inkwell",
  description: "Where stories find their readers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

// Location: src/app/layout.tsx
// End of file: layout.tsx