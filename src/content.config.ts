import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const essays = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/essays' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    lesswrongUrl: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    sequence: z.string().optional(),
    sequenceOrder: z.number().optional(),
  }),
});

export const collections = { essays };
