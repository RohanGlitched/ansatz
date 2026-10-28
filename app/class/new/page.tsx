import type { Metadata } from "next";
import Link from "next/link";
import ClassMaker from "@/components/ClassMaker";
import { Note, Page } from "@/components/book/Plate";
import styles from "./new.module.css";

export const metadata: Metadata = { title: "Make a class link", description: "Give a class of students their own Ansatz runs for a week, and see every result on one page.", alternates: { canonical: "/class/new" } };

export default function NewClassPage() {
  return (
    <>
      <header className={styles.title}>
        <h1>A physics lab for your whole class</h1>
        <div className={styles.abstract}>
          <p>
            Students film a drop, a swing or a bounce at home or in the lab. You see every result, and every measurement of g, on one page, marked against the value it should have found.
          </p>
          <p className={styles.small}>
            See what that page looks like: <Link href="/class/demo23">a demo class</Link>.
          </p>
        </div>
      </header>

      <Page className={styles.page}>
        <section className={styles.part}>
          <h2>Make the link</h2>
          <p className={styles.lead}>
            A school&rsquo;s students usually share one internet connection, and Ansatz limits runs per connection. A class link gives your class its own 45 runs for a week: one experiment each for a class of 40, or a four-length pendulum series for eleven benches.
          </p>
          <div className={styles.maker}>
            <ClassMaker />
          </div>
        </section>
        <Note who="Limits">Runs also stay within the site&rsquo;s daily limit, so a very busy day may ask students to try again tomorrow. Class links start in lite mode, where no Muse model is called; a student can switch to a full run.</Note>

        <section className={styles.part}>
          <h2>How a class uses it</h2>
          <ol className={styles.steps}>
            <li>
              <h3>Share the students&rsquo; link</h3>
              <p>It opens Run an experiment for your class. Each student can type a name or roll number, so you can tell the rows apart.</p>
            </li>
            <li>
              <h3>Students film and run</h3>
              <p>A phone propped on some books, the motion side on, an A4 sheet on the wall for scale. SAM 3.1 measures every frame and code fits the laws; each run takes a couple of minutes.</p>
            </li>
            <li>
              <h3>You read the grading sheet</h3>
              <p>One row per run: the value measured with its error bar, how far it is from the known value, the law that won, and a flag where the clip needs a second look. Download it as a CSV for your marks book.</p>
            </li>
          </ol>
        </section>
        <Note who="Provenance">Every number on the class page links to its own experiment, where each model&rsquo;s part and every fitted frame can be checked.</Note>
      </Page>
    </>
  );
}
