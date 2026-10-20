import { redirect } from 'next/navigation';

/* Posting moved into Hiring, beside My requests; links to the old address still land on the form. */
export default function PostRequestMoved() {
  redirect('/workspace/requests/new');
}
