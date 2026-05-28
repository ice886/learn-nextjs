import bcrypt from 'bcrypt';
import { getDb } from '../lib/mongodb';
import { invoices, customers, revenue, users } from '../lib/placeholder-data';

async function seedUsers(db: Awaited<ReturnType<typeof getDb>>) {
  const collection = db.collection('users');
  await collection.createIndex({ email: 1 }, { unique: true });

  const userDocs = await Promise.all(
    users.map(async (user) => ({
      ...user,
      password: await bcrypt.hash(user.password, 10),
    })),
  );

  return collection.insertMany(userDocs, { ordered: false }).catch(() => ({
    insertedCount: 0,
  }));
}

async function seedCustomers(db: Awaited<ReturnType<typeof getDb>>) {
  const collection = db.collection('customers');
  await collection.createIndex({ id: 1 }, { unique: true });
  return collection.insertMany(customers, { ordered: false }).catch(() => ({
    insertedCount: 0,
  }));
}

async function seedInvoices(db: Awaited<ReturnType<typeof getDb>>) {
  const collection = db.collection('invoices');
  // 清除没有 id 字段的旧数据（MongoDB 自动生成的 _id 不等于业务 id）
  await collection.deleteMany({ id: { $exists: false } });
  await collection.createIndex({ id: 1 }, { unique: true });
  return collection.insertMany(invoices, { ordered: false }).catch(() => ({
    insertedCount: 0,
  }));
}

async function seedRevenue(db: Awaited<ReturnType<typeof getDb>>) {
  const collection = db.collection('revenue');
  await collection.createIndex({ month: 1 }, { unique: true });
  return collection.insertMany(revenue, { ordered: false }).catch(() => ({
    insertedCount: 0,
  }));
}

export async function GET() {
  try {
    const db = await getDb();

    await Promise.all([
      seedUsers(db),
      seedCustomers(db),
      seedInvoices(db),
      seedRevenue(db),
    ]);

    return Response.json({ message: 'Database seeded successfully' });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
