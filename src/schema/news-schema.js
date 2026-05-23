import { z } from "zod";

export const NewsSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  url: z.string().url(),
  source: z.string(),
  scraped_at: z.string()
});

export function validateNewsItem(item) {
  const result = NewsSchema.safeParse(item);

  return result.success;
}
