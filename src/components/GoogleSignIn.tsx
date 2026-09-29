'use client';

import { signIn } from 'next-auth/react';

interface GoogleSignInProps {
  children: React.ReactNode;
}

export default function GoogleSignIn({ children }: GoogleSignInProps): React.JSX.Element {
  return <button className="google-button" type="button" onClick={() => void signIn('google', { callbackUrl: '/dashboard' })}>{children}</button>;
}
