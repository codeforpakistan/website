import { defineCollection, z } from 'astro:content';

const peopleSchema = z.object({
  title: z.string(),
  image: z.string().optional().default('/img/home_banner.jpg'),
  designation: z.string().optional().default(''),
  group: z.string().optional().default(''),
  sortOrder: z.number().optional().default(0),
  linkedin: z.string().optional().default(''),
  github: z.string().optional().default(''),
  twitter: z.string().optional().default(''),
});

const baseSchema = z.object({
  title: z.string(),
  summary: z.string().optional().default(''),
  image: z.string().optional().default('/img/home_banner.jpg'),
  group: z.string().optional().default(''),
  sortOrder: z.number().optional().default(0),
  designation: z.string().optional().default(''),
  bio: z.string().optional().default(''),
  linkedin: z.string().optional().default(''),
  github: z.string().optional().default(''),
  twitter: z.string().optional().default(''),
  location: z.string().optional().default(''),
  createdAt: z.string().optional().default(''),
  startDate: z.string().optional().default(''),
  dueDate: z.string().optional().default(''),
});

const projectSchema = z.object({
  title: z.string(),
  summary: z.string().optional().default(''),
  image: z.string().optional().default('/img/home_banner.jpg'),
  sortOrder: z.number().optional().default(0),
});

const reportSchema = z.object({
  title: z.string(),
  summary: z.string().optional().default(''),
  image: z.string().optional().default('/img/home_banner.jpg'),
  sortOrder: z.number().optional().default(0),
  createdAt: z.string().optional().default(''),
  attachment: z.string().optional().default(''),
});

const people = defineCollection({ schema: peopleSchema });
const projects = defineCollection({ schema: projectSchema });
const stories = defineCollection({ schema: baseSchema });
const events = defineCollection({ schema: baseSchema });
const reports = defineCollection({ schema: reportSchema });
const jobs = defineCollection({ schema: baseSchema });

export const collections = {
  people,
  projects,
  stories,
  events,
  reports,
  jobs,
};
