import { promotionImage } from '@/lib/extras';

/** A poster's image (public: posters are shown to every visitor). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const img = await promotionImage((await params).id);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(img.image), { headers: { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=3600' } });
}
