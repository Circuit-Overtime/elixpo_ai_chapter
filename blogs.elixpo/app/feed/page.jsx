import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Feed',
  description: 'Your personalized feed on LixBlogs — discover stories from writers you follow.',
};

export default function Feed() {
  redirect('/');
}
