import {useRouter} from 'next/router';
import {useEffect} from 'react';

/**
 * Instant redirect to the Discord server.
 */
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    void router.push('https://discord.gg/sAPURyakc4');
  }, [router]);

  return <></>;
}
