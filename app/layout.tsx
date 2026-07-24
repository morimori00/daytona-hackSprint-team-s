import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Preview Dog',
  description: 'Label an issue or a pull request. Get a video back proving what happens.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
