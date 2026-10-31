import { notFound } from "next/navigation";
import Image2PsdDemoWorkspace from "@/components/image2psd-demo/workspace";

export const dynamic = "force-dynamic";

export default function Image2PsdDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Image2PsdDemoWorkspace />;
}
