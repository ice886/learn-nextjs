import { getDb } from '../lib/mongodb';

async function listInvoices() {
  const db = await getDb();
  const data = await db
    .collection('invoices')
    .aggregate([
      { $match: { amount: 666 } },
      {
        $lookup: {
          from: 'customers',
          localField: 'customer_id',
          foreignField: 'id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      {
        $project: {
          amount: 1,
          name: '$customer.name',
          _id: 0,
        },
      },
    ])
    .toArray();

  return data;
}

export async function GET() {
  try {
    return Response.json(await listInvoices());
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
