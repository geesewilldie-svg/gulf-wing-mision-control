import type { Metadata } from "next";
import Presentation from "@/components/presentation";
export const metadata: Metadata = { title: "Gulf Wing | Presentation Display" };
export default function DisplayPage() {
  return <Presentation />;
}
