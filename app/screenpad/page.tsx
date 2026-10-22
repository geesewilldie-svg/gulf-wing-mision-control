import type { Metadata } from "next";
import ScreenPad from "@/components/screenpad";
export const metadata: Metadata = { title: "Gulf Wing | ScreenPad Console" };
export default function ScreenPadPage() {
  return <ScreenPad />;
}
