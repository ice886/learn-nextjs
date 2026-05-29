'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from './mongodb';


const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Customer is required',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Amount must be greater than 0' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Status is required',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};
export async function createInvoice(prevState: State, formData: FormData) {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
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
    return {
      message: 'Database Error: Failed to Create Invoice.',
    };
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