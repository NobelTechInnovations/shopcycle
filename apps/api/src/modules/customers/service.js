const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

async function listCustomers(prisma, storeId, query) {
  const [customers, total] = await repository.list(prisma, storeId, query);
  const withTotals = customers.map((c) => ({
    ...c,
    totalSpent: c.orders.reduce((sum, o) => sum + Number(o.total), 0),
    orderCount: c.orders.length,
  }));
  return { customers: withTotals, total, page: query.page, pageSize: query.pageSize };
}

async function getCustomer(prisma, storeId, id) {
  const customer = await repository.findById(prisma, storeId, id);
  if (!customer) throw new HttpError(404, "Customer not found");
  return customer;
}

async function createCustomer(prisma, storeId, input) {
  const existing = await repository.findByEmail(prisma, storeId, input.email);
  if (existing) throw new HttpError(409, "A customer with that email already exists");
  return repository.create(prisma, storeId, input);
}

async function updateCustomer(prisma, storeId, id, input) {
  await getCustomer(prisma, storeId, id);
  if (input.email) {
    const existing = await repository.findByEmail(prisma, storeId, input.email, id);
    if (existing) throw new HttpError(409, "A customer with that email already exists");
  }
  return repository.update(prisma, id, input);
}

async function deleteCustomer(prisma, storeId, id) {
  await getCustomer(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
