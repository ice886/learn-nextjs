import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { getDb } from './mongodb';
import { formatCurrency } from './utils';

export async function fetchRevenue() {
  try {
    const db = await getDb();
    const data = await db.collection('revenue').find().toArray();
    return data as unknown as Revenue[];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const db = await getDb();
    const data = await db
      .collection('invoices')
      .aggregate([
        { $sort: { date: -1 } },
        { $limit: 5 },
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
            id: 1,
            name: '$customer.name',
            image_url: '$customer.image_url',
            email: '$customer.email',
          },
        },
      ])
      .toArray();

    const latestInvoices = (data as unknown as LatestInvoiceRaw[]).map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    const db = await getDb();
    const invoiceCountPromise = db.collection('invoices').countDocuments();
    const customerCountPromise = db.collection('customers').countDocuments();
    const invoiceStatusPromise = db
      .collection('invoices')
      .aggregate([
        {
          $group: {
            _id: null,
            paid: {
              $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] },
            },
          },
        },
      ])
      .toArray();

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = data[0];
    const numberOfCustomers = data[1];
    const totalPaidInvoices = formatCurrency(data[2][0]?.paid ?? 0);
    const totalPendingInvoices = formatCurrency(data[2][0]?.pending ?? 0);

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;

function buildInvoiceFilter(query: string) {
  if (!query) return {};
  const regex = { $regex: query, $options: 'i' };
  return {
    $or: [
      { 'customer.name': regex },
      { 'customer.email': regex },
      { status: regex },
      { $expr: { $regexMatch: { input: { $toString: '$amount' }, regex: query, options: 'i' } } },
      { date: regex },
    ],
  };
}

export async function fetchFilteredInvoices(query: string, currentPage: number) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const db = await getDb();
    const invoices = await db
      .collection('invoices')
      .aggregate([
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_id',
            foreignField: 'id',
            as: 'customer',
          },
        },
        { $unwind: '$customer' },
        { $match: buildInvoiceFilter(query) },
        { $sort: { date: -1 } },
        { $skip: offset },
        { $limit: ITEMS_PER_PAGE },
        {
          $project: {
            id: 1,
            amount: 1,
            date: 1,
            status: 1,
            name: '$customer.name',
            email: '$customer.email',
            image_url: '$customer.image_url',
          },
        },
      ])
      .toArray();

    return invoices as unknown as InvoicesTable[];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const db = await getDb();
    const result = await db
      .collection('invoices')
      .aggregate([
        {
          $lookup: {
            from: 'customers',
            localField: 'customer_id',
            foreignField: 'id',
            as: 'customer',
          },
        },
        { $unwind: '$customer' },
        { $match: buildInvoiceFilter(query) },
        { $count: 'count' },
      ])
      .toArray();

    const totalPages = Math.ceil((result[0]?.count ?? 0) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const db = await getDb();
    const invoice = await db.collection('invoices').findOne(
      { id },
      { projection: { _id: 0, id: 1, customer_id: 1, amount: 1, status: 1 } },
    );

    if (!invoice) return undefined;

    return {
      ...invoice,
      amount: (invoice.amount as number) / 100,
    } as unknown as InvoiceForm;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const db = await getDb();
    const customers = await db
      .collection('customers')
      .find({})
      .project({ id: 1, name: 1, _id: 0 })
      .sort({ name: 1 })
      .toArray();

    return customers as unknown as CustomerField[];
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const db = await getDb();
    const matchStage = query
      ? {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
          ],
        }
      : {};

    const data = await db
      .collection('customers')
      .aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'invoices',
            localField: 'id',
            foreignField: 'customer_id',
            as: 'invoices',
          },
        },
        {
          $project: {
            id: 1,
            name: 1,
            email: 1,
            image_url: 1,
            total_invoices: { $size: '$invoices' },
            total_pending: {
              $reduce: {
                input: {
                  $filter: {
                    input: '$invoices',
                    cond: { $eq: ['$$this.status', 'pending'] },
                  },
                },
                initialValue: 0,
                in: { $add: ['$$value', '$$this.amount'] },
              },
            },
            total_paid: {
              $reduce: {
                input: {
                  $filter: {
                    input: '$invoices',
                    cond: { $eq: ['$$this.status', 'paid'] },
                  },
                },
                initialValue: 0,
                in: { $add: ['$$value', '$$this.amount'] },
              },
            },
          },
        },
        { $sort: { name: 1 } },
      ])
      .toArray();

    const customers = (data as unknown as CustomersTableType[]).map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}
