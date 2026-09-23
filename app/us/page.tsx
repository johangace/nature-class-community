import { LandingPage } from "../welcome/LandingPage";
import { landingMetadata } from "../welcome/landing-metadata";
export const dynamic = "force-dynamic";
export const metadata = landingMetadata("us");
export default function Page() { return <LandingPage locale="us" />; }
