'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from './mongodb';


const FormSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.coerce.number(),
  status: z.enum(['pending', 'paid']),
  date: z.string(),
})
const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });
export async function createInvoice(formData: FormData) {
  const { customerId, amount, status } = CreateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  try {
    const db = await getDb();
    await db.collection('invoices').insertOne({
      id: crypto.randomUUID(),
      customer_id: customerId,
      amount: amountInCents,
      status,
      date,
    });
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Failed to create invoice.');
   }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, formData: FormData) {
  const { customerId, amount, status } = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
 
  const amountInCents = amount * 100;
 
  try {
    const db = await getDb();
    await db.collection('invoices').updateOne(
      { id },
      { $set: { customer_id: customerId, amount: amountInCents, status } },
    );
  } catch (error) {
    console.error(error);
    throw new Error('Failed to update invoice.');
  }
 
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {

  const db = await getDb();
  await db.collection('invoices').deleteOne({ id });

  revalidatePath('/dashboard/invoices');
}