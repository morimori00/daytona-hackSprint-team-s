import { redirect } from 'next/navigation';

// The dashboard is the product; there is no separate marketing page to land on.
export default function Home() {
  redirect('/dashboard');
}
