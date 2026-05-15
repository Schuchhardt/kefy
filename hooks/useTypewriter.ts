import { useEffect, useState } from 'react';

export function useTypewriter(text: string, speed = 22, start = false) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!start) {
      setDisplayed('');
      return;
    }
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, start]);

  return displayed;
}
