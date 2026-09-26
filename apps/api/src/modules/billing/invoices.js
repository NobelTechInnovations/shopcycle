const { env } = require("../../config/env");
const { round2 } = require("./commission");

const GST_RATE = 18;

function seller() {
  return {
    name: env.PLATFORM_LEGAL_NAME,
    gstin: env.PLATFORM_GSTIN || null,
    address: env.PLATFORM_ADDRESS || null,
    state: env.PLATFORM_STATE,
    sac: env.PLATFORM_SAC || null,
  };
}

function buyer(store) {
  return {
    name: store.billingName || store.name,
    gstin: store.gstin || null,
    address: store.billingAddress || null,
    state: store.billingState || null,
  };
}

/** Place of supply decides the tax type: same state as Oyklane (or unknown,
 * which defaults to the supplier's state) → CGST + SGST; another state →
 * IGST. Amounts are GST-inclusive, so tax is backed out of the total. */
function taxBreakdown(total, buyerState) {
  const taxableValue = round2(total / (1 + GST_RATE / 100));
  const taxAmount = round2(total - taxableValue);
  const sameState = !buyerState || buyerState.trim().toLowerCase() === env.PLATFORM_STATE.trim().toLowerCase();
  return { taxableValue, taxAmount, taxType: sameState ? "cgst_sgst" : "igst" };
}

async function nextNumber(prisma) {
  const last = await prisma.platformInvoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.replace(/\D/g, "")) + 1 : 1;
  return `OYK-${String(n).padStart(6, "0")}`;
}

/** Issues the invoice for one renewal charge. Idempotent on the Razorpay
 * payment id — a retried webhook returns the invoice already issued. The
 * platform fees scheduled onto this renewal (see scheduleAccruedFees) are
 * itemised and marked paid in the same transaction. */
async function issueRenewalInvoice(prisma, store, { paymentId, total, periodStart, periodEnd, planName }) {
  if (paymentId) {
    const existing = await prisma.platformInvoice.findUnique({ where: { razorpayPaymentId: paymentId } });
    if (existing) return existing;
  }

  const scheduled = await prisma.commissionEntry.findMany({ where: { storeId: store.id, status: "scheduled" } });
  const fees = round2(scheduled.reduce((sum, e) => sum + Number(e.amount), 0));
  const planFee = round2(total - fees);

  const lines = [{ description: `${planName || "Oyklane"} plan — monthly subscription`, amount: planFee }];
  if (scheduled.length > 0) {
    const orders = scheduled.filter((e) => e.kind === "accrual").map((e) => `#${e.orderNumber}`);
    lines.push({
      description: `Platform fees — commission on ${orders.length} order${orders.length === 1 ? "" : "s"} (${orders.slice(0, 8).join(", ")}${orders.length > 8 ? ", …" : ""})`,
      amount: fees,
    });
  }

  const b = buyer(store);
  const tax = taxBreakdown(total, b.state);

  // Retry on a number collision — two renewals landing in the same instant.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const invoice = await tx.platformInvoice.create({
          data: {
            storeId: store.id,
            number: await nextNumber(tx),
            razorpayPaymentId: paymentId || null,
            periodStart: periodStart || null,
            periodEnd: periodEnd || null,
            lines,
            total: round2(total),
            ...tax,
            seller: seller(),
            buyer: b,
          },
        });
        if (scheduled.length > 0) {
          await tx.commissionEntry.updateMany({
            where: { id: { in: scheduled.map((e) => e.id) } },
            data: { status: "paid", invoiceId: invoice.id },
          });
        }
        return invoice;
      });
    } catch (err) {
      if (err.code === "P2002" && String(err.meta?.target || "").includes("number")) continue;
      if (err.code === "P2002" && paymentId) {
        return prisma.platformInvoice.findUnique({ where: { razorpayPaymentId: paymentId } });
      }
      throw err;
    }
  }
  throw new Error("Could not allocate an invoice number");
}

module.exports = { issueRenewalInvoice, taxBreakdown, GST_RATE };
