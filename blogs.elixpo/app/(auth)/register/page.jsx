import { redirect } from 'next/navigation';

export default function Register() {
  redirect('/api/auth/login');
}
