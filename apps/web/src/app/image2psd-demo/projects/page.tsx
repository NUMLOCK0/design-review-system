import { notFound } from "next/navigation";
import PsdProjectsDemoWorkspace from "@/components/image2psd-demo/projects-workspace";

export const dynamic = "force-dynamic";

export default function PsdProjectsDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PsdProjectsDemoWorkspace />;
}
