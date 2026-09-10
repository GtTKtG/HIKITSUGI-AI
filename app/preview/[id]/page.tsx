import { notFound } from "next/navigation";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { getCurrentAuth, canAccessSubmission } from "@/lib/authServer";
import { PreviewEditor } from "./PreviewEditor";

/**
 * 仕様書8章 画面4「引継書プレビュー」。
 * 本人（または運営者）が内容を修正できる形で表示する。
 */
export default async function PreviewPage({ params }: { params: { id: string } }) {
  let submission;
  try {
    submission = await getSubmission(params.id);
  } catch (err) {
    if (err instanceof SubmissionsUnavailableError) {
      return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1>引継書プレビュー</h1>
          <p style={{ color: "crimson" }}>{err.message}</p>
        </main>
      );
    }
    throw err;
  }

  if (!submission) notFound();

  const auth = await getCurrentAuth();
  if (!canAccessSubmission(auth, submission.id)) notFound();

  return <PreviewEditor submission={submission} />;
}
