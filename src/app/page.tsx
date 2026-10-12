import Link from "next/link";
import { auth } from "@/lib/auth";
import { GoogleIcon } from "@/components/GoogleIcon";
import GoogleSignIn from "@/components/GoogleSignIn";
import "./landing.css";

export default async function Home(): Promise<React.JSX.Element> {
  const session = await auth();
  if (session)
    return (
      <main className="landing-page">
        <div className="landing-card">
          <p className="brand-mark">QUANTIFY</p>
          <span className="landing-eyebrow">STOCK MARKET INTELLIGENCE</span>
          <h1>Your portfolio, with a clearer point of view.</h1>
          <p className="landing-copy">
            Track holdings, understand signals, and test strategies in one
            focused workspace.
          </p>
          <Link className="landing-primary" href="/dashboard">
            Open your dashboard
          </Link>
        </div>
      </main>
    );
  return (
    <main className="landing-page">
      <div className="landing-card">
        <p className="brand-mark">QUANTIFY</p>
        <span className="landing-eyebrow">STOCK MARKET INTELLIGENCE</span>
        <h1>Make every market decision more deliberate.</h1>
        <p className="landing-copy">
          A calm workspace for tracking your portfolio, exploring strategies,
          and understanding what the market is saying.
        </p>
        <div className="landing-actions">
          <GoogleSignIn>
            <GoogleIcon />
            Continue with Google
          </GoogleSignIn>
        </div>
        <p className="landing-note">
          Create your account or sign in securely with Google to continue.
        </p>
      </div>
      <div className="landing-orbit landing-orbit-one" />
      <div className="landing-orbit landing-orbit-two" />
    </main>
  );
}
