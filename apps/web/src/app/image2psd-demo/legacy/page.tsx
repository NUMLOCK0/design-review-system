import { notFound } from "next/navigation";
import LegacyWorkspace from "@/components/image2psd-demo/legacy-workspace";

export const dynamic = "force-dynamic";

export default function LegacyPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LegacyWorkspace />;
}
