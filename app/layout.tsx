import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/components/workspace-provider";
export const metadata: Metadata = {
  icons: { icon: "/favicon.svg" },
  title: "Gulf Wing | Mission Control",
  description:
    "Holographic command workspace with optional local device synchronization. AI agents are simulated.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </body>
    </html>
  );
}
