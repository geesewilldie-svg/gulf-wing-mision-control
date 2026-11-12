import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/components/workspace-provider";
import NexusAssistant from "@/components/nexus-assistant";
export const metadata: Metadata = {
  icons: { icon: "/favicon.svg" },
  title: "Gulf Wing | Mission Control",
  description:
    "Personal assistant workspace with local voice, private knowledge, business operations and optional connected services.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <NexusAssistant>{children}</NexusAssistant>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
