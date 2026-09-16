import { NextResponse } from 'next/server';

/** Cheap endpoint for uptime checks; deliberately requires no session. */
export function GET() {
  return NextResponse.json({ status: 'ok', time: new Date().toISOString() });
}
