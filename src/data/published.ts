export type PublishedWork = {
  title: string;
  url: string;
  venue?: string;
  displayDate: string;
  sortDate: Date;
};

export const published: PublishedWork[] = [
  {
    title: 'Popular Constitutionalism in Theory and Practice',
    url: '/papers/popular-constitutionalism-in-theory-and-practice.pdf',
    venue: 'Brown Undergraduate Law Review',
    displayDate: 'December 1, 2022',
    sortDate: new Date('2022-12-01'),
  },
  {
    title: 'Kantian Practical Ethics is Empty',
    url: '/papers/kantian-practical-ethics-is-empty.pdf',
    venue: 'Sapere Aude',
    displayDate: 'July 1, 2022',
    sortDate: new Date('2022-07-01'),
  },
];
