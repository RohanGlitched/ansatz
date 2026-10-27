"use server";
import { redirect } from "next/navigation";
import { setTapeLength } from "@/lib/series";

/** Saves the string length a student measured with a tape (in cm, as a metre scale reads), or clears it. */
export async function saveTape(form: FormData) {
  const id = String(form.get("series") ?? ""), run = String(form.get("run") ?? "");
  const raw = String(form.get("cm") ?? "").trim().replace(",", ".");
  const cm = raw === "" ? null : Number(raw);
  if (cm === null || (Number.isFinite(cm) && cm > 2 && cm < 3000)) await setTapeLength(id, run, cm === null ? null : cm / 100).catch(() => {});
  redirect(`/series/${encodeURIComponent(id)}`);
}
