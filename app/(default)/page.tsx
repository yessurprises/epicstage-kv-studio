"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/studio");
  }, [router]);

  return (
    <>
      {/* Non-JS fallback: meta refresh still fires on static HTML. */}
      <meta httpEquiv="refresh" content="0;url=/studio/" />
      <div className="flex min-h-[40vh] items-center justify-center pt-28 text-sm text-gray-500 md:pt-36">
        Studio로 이동 중…
      </div>
    </>
  );
}
