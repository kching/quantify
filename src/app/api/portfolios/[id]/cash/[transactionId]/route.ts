import { deleteCashTransaction, listPortfolios } from "@/core/db";
import { capturePortfolioPerformance } from "@/core/performance.service";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; transactionId: string }> },
): Promise<Response> {
  const { id: portfolioIdString, transactionId: transactionIdString } =
    await context.params;
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const portfolioId = Number(portfolioIdString);
  const transactionId = Number(transactionIdString);
  if (
    !Number.isSafeInteger(portfolioId) ||
    portfolioId < 1 ||
    !Number.isSafeInteger(transactionId) ||
    transactionId < 1
  ) {
    return Response.json(
      { error: "Invalid portfolio or cash transaction." },
      { status: 400 },
    );
  }
  if (
    !(await listPortfolios(user.id)).some(
      (portfolio) => portfolio.id === portfolioId,
    )
  )
    return Response.json({ error: "Portfolio not found." }, { status: 404 });
  try {
    const transaction = await deleteCashTransaction(
      portfolioId,
      transactionId,
      user.id,
    );
    await capturePortfolioPerformance(portfolioId);
    return Response.json({ ok: true, transaction });
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Unable to delete this cash transaction.";
    return Response.json(
      { error: message },
      { status: message === "Cash transaction not found." ? 404 : 422 },
    );
  }
}
