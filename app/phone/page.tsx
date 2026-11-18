import Link from "next/link";
import NexusPhoneInstall from "@/components/nexus-phone-install";
export default function PhoneSetup() {
  return <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px 120px" }}>
    <Link href="/nexus">← Back to Nexus</Link>
    <h1>Nexus on your Android phone</h1>
    <p>Add Nexus to your home screen and connect to the same assistant running on your host.</p>
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>1. Connect to your host</h2>
      <p>Your laptop or dedicated Nexus computer must be awake, running Nexus and reachable. Use its trusted HTTPS address on your phone. localhost on a phone refers to the phone, not your laptop.</p>
      <p>For access away from home, set up a private network connection and HTTPS on the host first. This page does not set up remote networking. Keep Nexus behind that private connection.</p>
    </section>
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>2. Install Nexus</h2><NexusPhoneInstall />
    </section>
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>3. Pair and talk</h2>
      <p>Open Nexus, choose Connect devices and pair this phone as a controller using your host’s pairing code. Then open Talk to Nexus, choose Jessica, allow cloud speech for the session and allow microphone access.</p>
      <Link href="/nexus">Open Nexus</Link>
    </section>
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <h2>What works in this version</h2>
      <p>This is an installable web app. It needs a reachable host and network connection. Installation does not add offline answers, push notifications, a wake word or reliable listening with the screen locked. Android may suspend microphone use when the app is in the background.</p>
      <p>Car stereo, TV and other device controls will be connected individually. Android Auto support is separate from installing this app on a phone.</p>
    </section>
  </main>;
}
