import { NextResponse } from "next/server";
import { getAuthFromCookies } from "@/lib/auth";

export async function GET() {
  const auth = await getAuthFromCookies();
  if (!auth) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
    },
  });
}
