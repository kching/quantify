import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quantify | ASX Market Monitor",
  description:
    "Local ASX market monitoring, explainable strategy signals, and cached historical backtesting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
