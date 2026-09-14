import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "./auth";

/*
import { SmoothScroll } from "@/components/site/smooth-scroll";
import { SiteNav } from "@/components/site/nav";
import { HeroStage } from "@/components/site/hero-stage";
import { BillingScene, ControlScene, DeliveryScene, FinalScene, MovementScene, ProblemScene } from "@/components/site/landing-scenes";
*/

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — MarichiFleet" },
      {
        name: "description",
        content: "Sign in to the MarichiFleet transport control tower, driver app or client portal.",
      },
      { property: "og:title", content: "Sign in — MarichiFleet" },
      {
        property: "og:description",
        content: "Access your MarichiFleet account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

/*
function Landing() {
  return (
    <div className="marketing-site">
      <SmoothScroll />
      <SiteNav />

      <main className="relative bg-background text-foreground">
        <HeroStage />
        <ProblemScene />
        <ControlScene />
        <MovementScene />
        <DeliveryScene />
        <BillingScene />
        <FinalScene />
      </main>
    </div>
  );
}
*/
