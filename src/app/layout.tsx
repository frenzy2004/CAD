import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PatchCAD — local AI CAD patching",
  description:
    "Circle one CAD feature, describe a dimensional change, and verify that protected geometry stayed unchanged.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
