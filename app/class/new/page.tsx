import type { Metadata } from "next";
import ClassMaker from "@/components/ClassMaker";

export const metadata: Metadata = { title: "Make a class link", description: "Give a class of students their own Ansatz runs for a week, and see every result on one page." };

export default function NewClassPage() {
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 24 }}>
      <h1 style={{ fontSize: "clamp(30px, 4vw, 46px)", maxWidth: "20ch" }}>A physics lab for your whole class</h1>
      <p className="lede" style={{ maxWidth: "65ch" }}>
        A school’s students usually share one internet connection, and Ansatz limits runs per connection. A class link gives your class its own 45 runs for a week: one experiment each for a class of 40, or a four-length pendulum series for eleven benches. Runs also stay within the site’s daily limit, so a very busy day may ask students to try again tomorrow. Students film a drop, a swing or a bounce at home or in the lab, and you see every result, and every measurement of g, on one page.
      </p>
      <p className="small">
        See what the class page looks like: <a href="/class/demo23">a demo class</a>.
      </p>
      <ClassMaker />
    </div>
  );
}
