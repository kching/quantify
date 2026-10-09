import {
  listCashTransactionPage,
  listPortfolios,
  recordCashTransaction,
} from "@/core/db";
import type { CashTransactionType } from "@/core/types";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = Number((await context.params).id);
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Invalid portfolio." }, { status: 400 });
  if (!(await listPortfolios(user.id)).some((portfolio) => portfolio.id === id))
    return Response.json({ error: "Portfolio not found." }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const page = params.has("page") ? Number(params.get("page")) : 1;
  if (!Number.isSafeInteger(page) || page < 1)
    return Response.json({ error: "Enter a valid page." }, { status: 400 });
  return Response.json(await listCashTransactionPage(id, page));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const portfolioId = Number((await context.params).id);
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as {
    type?: unknown;
    amount?: unknown;
    timestamp?: unknown;
    note?: unknown;
  };
  const type = body.type;
  const amount = Number(body.amount);
  const timestamp = Number(body.timestamp);
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 160) : "";
  if (
    !Number.isSafeInteger(portfolioId) ||
    portfolioId < 1 ||
    (type !== "DEPOSIT" && type !== "WITHDRAWAL") ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 1
  ) {
    return Response.json(
      {
        error:
          "Enter a valid transaction type, positive AUD amount and transaction time.",
      },
      { status: 400 },
    );
  }
  try {
    const input = {
      portfolioId,
      type: type as CashTransactionType,
      amount,
      timestamp,
      note,
    };
    const transaction = await recordCashTransaction(input, user.id);
    return Response.json({ transaction }, { status: 201 });
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Unable to record this cash transaction.";
    return Response.json(
      { error: message },
      { status: message === "Portfolio not found." ? 404 : 422 },
    );
  }
}
