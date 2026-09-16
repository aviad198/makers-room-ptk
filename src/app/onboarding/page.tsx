import { redirect } from 'next/navigation';

import { ProfileForm } from '@/components/profile-form';
import { getSessionContext } from '@/lib/bookings/service';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your details · MakersRoom PTK' };

export default async function OnboardingPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  const isFirstTime = !session.profile.phone || !session.profile.full_name;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {isFirstTime ? 'Welcome to MakersRoom PTK' : 'Your contact details'}
        </h1>
        <p className="mt-2 mb-6 text-sm text-slate-500">
          {isFirstTime
            ? 'We need a phone number before your first booking, so we can reach you if a print fails or an urgent job takes your slot.'
            : 'Keep these current so members can reach you about your prints.'}
        </p>

        <ProfileForm
          initialName={session.profile.full_name ?? ''}
          initialPhone={session.profile.phone ?? ''}
          email={session.profile.email}
        />
      </div>
    </main>
  );
}
