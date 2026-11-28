import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const getApiBase = () => {
  const envUrl =
    process.env.INTERNAL_API_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/+$/, "");
  }
  return "http://127.0.0.1:8000";
};

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const pathSegment = path && path.length > 0 ? path.join("/") : "";
  const apiBase = getApiBase();
  const search = request.nextUrl.search || "";
  const targetUrl = `${apiBase}/api/v1/${pathSegment}${search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    // Do not forward host or connection hop-by-hop headers
    if (lower !== "host" && lower !== "connection" && lower !== "transfer-encoding") {
      headers.set(key, value);
    }
  });

  const method = request.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  let body: ArrayBuffer | undefined = undefined;
  if (hasBody) {
    try {
      body = await request.arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  try {
    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    res.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "content-encoding" && lower !== "transfer-encoding") {
        responseHeaders.set(key, value);
      }
    });

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error(`[Dashboard Proxy Error] Target: ${targetUrl}`, err);
    return NextResponse.json(
      {
        detail: "Backend API communication failed",
        error: err?.message || String(err),
      },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;
