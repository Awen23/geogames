import { useEffect } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import styles from './ErrorPage.module.css';

/** Router-level errorElement: shown instead of a crashed page, or for an unknown URL. */
export function ErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) { console.error('Route error:', error); }
  }, [error, notFound]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
      <p className={styles.message}>
        {notFound ? "That page doesn't exist." : 'Sorry, this page hit an error. Try reloading, or head back home.'}
      </p>
      <Link to="/" className={styles.homeLink}>← Back to games</Link>
    </div>
  );
}
