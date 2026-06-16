import {WIKI_URI} from '../lib/constants';
import type {GetServerSideProps} from 'next';

export default function Docs() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: WIKI_URI,
      permanent: false,
    },
  };
};
