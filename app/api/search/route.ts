// Dev proxy — Naver 이미지 검색 직접 호출 (Worker 배포 전 로컬 테스트용)
// 프로덕션: output: "export"로 빌드 시 이 파일은 무시됨


export async function POST(req: Request) {
  const { query, limit = 20 } = await req.json();

  if (!query?.trim()) {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json({ error: "Naver API key not configured" }, { status: 500 });
  }

  const headers = {
    "X-Naver-Client-Id": clientId,
    "X-Naver-Client-Secret": clientSecret,
  };

  const n = Math.min(limit, 30);
  const [imageResp, blogResp] = await Promise.allSettled([
    fetch(`https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=${n}&filter=large&sort=sim`, { headers }),
    fetch(`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${Math.min(n, 10)}`, { headers }),
  ]);

  const results: any[] = [];

  if (imageResp.status === "fulfilled" && imageResp.value.ok) {
    const data = await imageResp.value.json() as any;
    for (const item of (data.items ?? [])) {
      results.push({
        title: item.title?.replace(/<[^>]+>/g, "") ?? "",
        url: item.link ?? "",
        thumbnail: item.thumbnail ?? item.link ?? "",
        source: "naver_image",
      });
    }
  }

  if (blogResp.status === "fulfilled" && blogResp.value.ok) {
    const data = await blogResp.value.json() as any;
    for (const item of (data.items ?? [])) {
      if (item.thumbnail) {
        results.push({
          title: item.title?.replace(/<[^>]+>/g, "") ?? "",
          url: item.link ?? "",
          thumbnail: item.thumbnail,
          source: "naver_blog",
        });
      }
    }
  }

  return Response.json({ results, total: results.length, query });
}
