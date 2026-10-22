import type { Metadata } from "next";
import NexusConsole from "@/components/nexus-console";
export const metadata: Metadata = {
  title: "Nexus | Gulf Wing Business Command",
};
export default function NexusPage() {
  return <NexusConsole />;
}
