// One-off, read-only diagnostic -- NOT part of the app, NOT a test.
// Finds exactly which row blocks jest.global-setup.ts's cleanup DELETE.
import { prisma } from '../src/shared/db';

async function main() {
  const testAccounts = await prisma.users.findMany({
    where: { email_or_username: { contains: 'test-', mode: 'insensitive' } },
    select: { id: true, email_or_username: true },
  });
  const testIds = new Set(testAccounts.map((u) => u.id));
  console.log('Test accounts found:', testAccounts.length);

  const testProducts = await prisma.products.findMany({
    where: { created_by: { in: [...testIds] } },
    select: { id: true, name: true, sku: true, created_by: true },
  });
  console.log('Products created_by test account:', testProducts.length);

  for (const p of testProducts) {
    const items = await prisma.transaction_items.findMany({
      where: { product_id: p.id },
      select: { id: true, transaction_id: true },
    });
    if (items.length === 0) continue;
    console.log(`\nProduct "${p.name}" (${p.id}, created_by=${p.created_by}) has ${items.length} transaction_item(s):`);
    for (const it of items) {
      const tx = await prisma.transactions.findUnique({
        where: { id: it.transaction_id },
        select: { id: true, cashier_user_id: true, created_at: true },
      });
      const isTestCashier = tx ? testIds.has(tx.cashier_user_id) : null;
      let cashierName = 'unknown';
      if (tx) {
        const cashier = await prisma.users.findUnique({ where: { id: tx.cashier_user_id }, select: { email_or_username: true } });
        cashierName = cashier?.email_or_username ?? 'unknown';
      }
      console.log(
        `  transaction_item=${it.id} tx=${it.transaction_id} tx_created_at=${tx?.created_at.toISOString()} cashier=${cashierName} isTestCashier=${isTestCashier}`
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
