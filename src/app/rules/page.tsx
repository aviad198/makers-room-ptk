import Link from 'next/link';

import { DEFAULT_POLICY } from '@/lib/scheduling';

export const metadata = { title: 'כללי ההזמנות · MakersRoom PTK' };

const TIER_LABELS_HE: Record<string, string> = {
  new: 'חבר חדש',
  regular: 'משתמש רגיל',
  heavy: 'משתמש כבד',
};

/** Hebrew-friendly duration text, e.g. "שעתיים ו-30 דקות". */
function formatMinutesHe(total: number): string {
  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  const hoursText = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;
  const minutesText = minutes === 1 ? 'דקה' : `${minutes} דקות`;

  if (hours === 0) return minutesText;
  if (minutes === 0) return hoursText;
  return `${hoursText} ו-${minutesText}`;
}

/**
 * Public explainer for the house rules. Kept readable without a session so a
 * prospective member can see how the queue works before signing in.
 */
export default function RulesPage() {
  const policy = DEFAULT_POLICY;

  return (
    <main dir="rtl" lang="he" className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        → חזרה ללוח הזמנים
      </Link>

      <h1 className="mt-6 text-2xl font-semibold text-slate-900">איך התור עובד</h1>
      <p className="mt-2 text-slate-600">
        שתי מדפסות, סדנה משותפת אחת. הכללים האלה שומרים על המכונות עסוקות, מונעים
        ממעט משתמשים כבדים לתפוס כל משבצת, ומוודאים שעבודה דחופה עדיין יכולה לעבור.
      </p>

      <Rule title="מגבלות אורך הדפסה">
        <p>
          הדפסת יום יכולה לרוץ עד {formatMinutesHe(policy.maxDaytimeMinutes)}. בלילה
          התקרה עולה ל־{formatMinutesHe(policy.maxOvernightMinutes)}, כי המכונה לא חוסמת
          אף אחד בזמן שאתם ישנים.
        </p>
      </Rule>

      <Rule title="הדפסות ארוכות עוברות ללילה">
        <p>
          כל הדפסה ארוכה מ־{formatMinutesHe(policy.longPrintThresholdMinutes)} חייבת
          להתקיים ברובה בתוך חלון הלילה (
          <span dir="ltr">
            {policy.overnightStartHour}:00–{policy.overnightEndHour}:00
          </span>
          ) — לפחות {Math.round(policy.overnightCoverageRatio * 100)}% מזמן הריצה. כך
          שעות היום נשארות פנויות לאיטרציות קצרות.
        </p>
      </Rule>

      <Rule title="עבודה דחופה קודמת להדפסות להנאה">
        <p>
          הזמנות מסומנות כ<strong>הנאה</strong>, <strong>עבודה</strong> או{' '}
          <strong>עבודה דחופה</strong>. עבודה דחופה יכולה להשתלט על משבצת שתפוסה על ידי
          הדפסה להנאה; בעל המשבצת מקבל הודעה במייל ובטלפון באופן מיידי. הזמנה דחופה
          לעולם לא דוחקת עבודה אחרת, ולעולם לא דוחקת הדפסה שכבר התחילה.
        </p>
        <p className="mt-2">
          כדי שהכפתור לא יישחק, הזמנה דחופה מחייבת נימוק בשורה אחת ומוגבלת ל־
          {policy.maxUrgentPerWindow} בכל {policy.usageWindowDays} ימים.
        </p>
      </Rule>

      <Rule title="משתמשים כבדים מזמינים קרוב יותר ליום ההדפסה">
        <p>
          כמה זמן מראש אפשר להזמין תלוי בכמות ההדפסה שלכם ב־{policy.usageWindowDays}{' '}
          הימים האחרונים:
        </p>
        <ul className="mt-3 space-y-1.5">
          {(['new', 'regular', 'heavy'] as const).map((tier) => (
            <li key={tier} className="flex flex-wrap gap-x-2 text-sm">
              <span className="font-medium text-slate-900">{TIER_LABELS_HE[tier]}:</span>
              <span className="text-slate-600">
                עד {policy.tiers[tier].bookingHorizonDays} ימים מראש ·{' '}
                {formatMinutesHe(policy.tiers[tier].weeklyMinutesCap)} בשבוע ·{' '}
                {policy.tiers[tier].maxActiveReservations} הזמנות פתוחות ·{' '}
                {policy.tiers[tier].primeTimeReservationsPerWeek} משבצות יום בשבוע
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          הופכים למשתמש כבד מעבר ל־{formatMinutesHe(policy.heavyMinutesThreshold)} או{' '}
          {policy.heavyReservationThreshold} הדפסות ב־{policy.usageWindowDays} ימים. האופק
          הקצר יותר הוא בדיוק הנקודה: הוא משאיר את הצד הרחוק של הלוח פתוח למי שמדפיס
          לעיתים רחוקות. חברים חדשים שומרים על האופק הארוך ביותר ב־
          {policy.newUserAccountAgeDays} הימים הראשונים שלהם.
        </p>
      </Rule>

      <Rule title={`משבצות פנויות נפתחות לכולם ${policy.openBookingHours} שעות מראש`}>
        <p>
          בתוך {policy.openBookingHours} שעות משעת ההתחלה כל המכסות מבוטלות. אם משבצת
          עדיין ריקה, כל אחד יכול לקחת אותה ללא קשר לדרגה או למכסה השבועית — מדפסת
          שעומדת בחוסר מעש לא עוזרת לאף אחד.
        </p>
      </Rule>

      <Rule title="פרטי קשר">
        <p>
          לכל חבר שמורים כתובת מייל ומספר טלפון. הם גלויים לחברים מחוברים אחרים, כדי
          שאפשר יהיה לטפל במהירות בהדפסה שנכשלה, במשטח תפוס או במשבצת שנדחקה.
        </p>
      </Rule>

      <p className="mt-10 text-sm text-slate-400">
        מנהלים יכולים לכוונן כל מספר שמופיע כאן בלי פריסה מחדש.
      </p>
    </main>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}
