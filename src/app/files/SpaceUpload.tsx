"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadButton } from "@/components/UploadButton";
import { moveToSpace } from "./spaces-client";

/** Upload button that files new uploads straight into the space being viewed. */
export function SpaceUpload({ workspaceId, spaceId }: { workspaceId: string; spaceId: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  if (!spaceId) return <UploadButton workspaceId={workspaceId} />;
  return <UploadButton workspaceId={workspaceId} onUploaded={async (f) => { await moveToSpace([f.id], spaceId); startTransition(() => router.refresh()); }} />;
}
