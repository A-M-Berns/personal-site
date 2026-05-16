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
    url: 'https://www.brownulr.org/fall-2022',
    venue: 'Brown Undergraduate Law Review',
    displayDate: 'December 1, 2022',
    sortDate: new Date('2022-12-01'),
  },
  {
    title: 'Kantian Practical Ethics is Empty',
    url: 'https://sapereaude.voices.wooster.edu/wp-content/uploads/sites/170/2022/07/sapereaude.anson_.pdf',
    venue: 'Sapere Aude',
    displayDate: 'July 1, 2022',
    sortDate: new Date('2022-07-01'),
  },
];
