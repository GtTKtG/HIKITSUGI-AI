import { notFound } from "next/navigation";
import { getSuccessorReviewByCode } from "@/lib/successorReviews";
import { getSubmission, SubmissionsUnavailableError } from "@/lib/supabase/submissions";
import { SuccessorReviewClient } from "./SuccessorReviewClient";

/**
 * 後任者による再現性確認（仕様書5.3）の入口。
 * 顧客固有コードと同様、URL中のコードそのものをゲートにする（認証Cookie不要）。
 */
export default async function SuccessorReviewPage({ params }: { params: { code: string } }) {
  let review;
  try {
    review = await getSuccessorReviewByCode(params.code);
  } catch (err) {
    if (err instanceof SubmissionsUnavailableError) {
      return <UnavailableNotice message={err.message} />;
    }
    throw err;
  }
  if (!review) notFound();

  const submission = await getSubmission(review.submission_id);
  if (!submission) notFound();

  return (
    <SuccessorReviewClient
      code={params.code}
      companyName={submission.company_name}
      employeeName={submission.employee_name}
      businesses={submission.result.businesses}
      initialItems={review.items}
      initialStatus={review.status}
      initialOverallComment={review.overall_comment}
    />
  );
}

function UnavailableNotice({ message }: { message: string }) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1>後任者確認</h1>
      <p style={{ color: "crimson" }}>{message}</p>
    </main>
  );
}
