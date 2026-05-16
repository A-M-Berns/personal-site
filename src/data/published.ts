export type PublishedWork = {
  title: string;
  titleHtml?: string;
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

export const otherWriting: PublishedWork[] = [
  {
    title: 'Model-independent prediction of R(ηc)',
    titleHtml: 'Model-independent prediction of R(<i>η</i><sub><i>c</i></sub>)',
    url: 'https://link.springer.com/article/10.1007/JHEP12(2018)114',
    venue: 'Journal of High Energy Physics',
    displayDate: 'December 18, 2018',
    sortDate: new Date('2018-12-18'),
  },
];
